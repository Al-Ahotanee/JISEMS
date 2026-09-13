const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { pool, cache } = require('../config/database');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');
const { broadcastCollation } = require('../websocket/socket.handler');

const HMAC_SECRET = process.env.HMAC_SECRET || (process.env.NODE_ENV === 'production' ? null : 'gsem-development-only-hmac-secret');
if (!HMAC_SECRET) throw new Error('HMAC_SECRET is required in production');

async function submitWardCollation(req, res) {
  const connection = await pool.getConnection();
  try {
    const userId = req.user.id;
    const { election_id, ward_id } = req.body;

    if (!election_id || !ward_id) {
      return ApiResponse.badRequest(res, 'election_id and ward_id are required');
    }

    // Must be ward_officer for this ward (or higher)
    const userRole = req.user.role;
    if (userRole === 'ward_officer' && req.user.ward_id !== ward_id) {
      return ApiResponse.forbidden(res, 'You can only collate results for your assigned ward');
    }
    if (!['ward_officer', 'lga_coordinator', 'state_coordinator', 'super_admin'].includes(userRole)) {
      return ApiResponse.forbidden(res, 'Insufficient permissions for ward collation');
    }

    // Verify election exists
    const [elections] = await pool.query(
      'SELECT id FROM elections WHERE id = ?',
      [election_id]
    );
    if (elections.length === 0) {
      return ApiResponse.notFound(res, 'Election not found');
    }

    // Verify ward exists and get its LGA
    const [wards] = await pool.query(
      'SELECT w.*, l.name AS lga_name FROM wards w JOIN lgas l ON w.lga_id = l.id WHERE w.id = ?',
      [ward_id]
    );
    if (wards.length === 0) {
      return ApiResponse.notFound(res, 'Ward not found');
    }
    const ward = wards[0];

    // Check for existing collation
    const [existingCollation] = await pool.query(
      'SELECT id FROM collation_records WHERE election_id = ? AND level = ? AND entity_id = ? AND status != ?',
      [election_id, 'ward', ward_id, 'rejected']
    );
    if (existingCollation.length > 0) {
      return ApiResponse.conflict(res, 'Ward collation already exists for this election');
    }

    // Get all verified PU results in this ward
    const [verifiedResults] = await pool.query(`
      SELECT rs.id, rs.polling_unit_id, pu.registered_voters, rs.accredited_voters,
             rs.total_votes_cast, rs.total_valid_votes, rs.rejected_votes
      FROM result_submissions rs
      JOIN polling_units pu ON rs.polling_unit_id = pu.id
      WHERE rs.election_id = ? AND rs.ward_id = ? AND rs.status = 'verified'
    `, [election_id, ward_id]);

    // Get total PUs in this ward
    const [[{ total_pus }]] = await pool.query(
      'SELECT COUNT(*) AS total_pus FROM polling_units WHERE ward_id = ?',
      [ward_id]
    );

    if (verifiedResults.length === 0) {
      return ApiResponse.badRequest(res, 'No verified results found in this ward to collate');
    }

    // Aggregate vote totals
    const totals = verifiedResults.reduce((acc, r) => {
      acc.registered_voters += r.registered_voters;
      acc.accredited_voters += r.accredited_voters;
      acc.total_votes_cast += r.total_votes_cast;
      acc.total_valid_votes += r.total_valid_votes;
      acc.rejected_votes += r.rejected_votes;
      return acc;
    }, { registered_voters: 0, accredited_voters: 0, total_votes_cast: 0, total_valid_votes: 0, rejected_votes: 0 });

    // Get candidate vote aggregates
    const submissionIds = verifiedResults.map(r => r.id);
    const placeholders = submissionIds.map(() => '?').join(',');
    const [candidateVotes] = await pool.query(`
      SELECT vd.candidate_id, c.full_name, c.party_name, c.party_code,
             SUM(vd.votes) AS total_votes
      FROM vote_data vd
      JOIN candidates c ON vd.candidate_id = c.id
      WHERE vd.submission_id IN (${placeholders})
      GROUP BY vd.candidate_id, c.full_name, c.party_name, c.party_code
      ORDER BY total_votes DESC
    `, submissionIds);

    // Generate collation hash
    const collationData = { election_id, ward_id, totals, candidateVotes, timestamp: new Date().toISOString() };
    const contentHash = crypto.createHash('sha256').update(JSON.stringify(collationData)).digest('hex');
    const digitalSignature = crypto.createHmac('sha256', HMAC_SECRET)
      .update(`${contentHash}:${userId}:${collationData.timestamp}`).digest('hex');

    await connection.beginTransaction();

    const [{ insertId: collationId }] = await connection.query(
      `INSERT INTO collation_records 
        (election_id, level, entity_id, entity_name,
         total_polling_units, reported_polling_units, 
         total_registered_voters, total_accredited_voters, total_votes_cast, total_valid_votes, total_rejected_votes,
         digital_signature, status, collated_by, signed_at, created_at, updated_at)
       VALUES (?, 'ward', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, NOW(), NOW(), NOW())`,
      [election_id, ward_id, ward.name,
       total_pus, verifiedResults.length,
       totals.registered_voters, totals.accredited_voters, totals.total_votes_cast,
       totals.total_valid_votes, totals.rejected_votes,
       digitalSignature, userId]
    );

    // Insert collation_aggregated_votes
    for (const cv of candidateVotes) {
      await connection.query(
        `INSERT INTO collation_aggregated_votes (collation_id, candidate_id, total_votes)
         VALUES (?, ?, ?)`,
        [collationId, cv.candidate_id, cv.total_votes]
      );
    }

    // Audit log
    await connection.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, new_value, ip_address, created_at)
       VALUES (?, ?, 'ward_collation', 'collation_record', ?, ?, ?, NOW())`,
      [uuidv4(), userId, collationId, JSON.stringify({
        ward_id, ward_name: ward.name, total_pus, reported: verifiedResults.length
      }), req.ip]
    );

    await connection.commit();

    // Invalidate live dashboard caches.
    cache.del('situation_room');
    cache.del('state_dash_latest');
    cache.del(`state_dash_${election_id}`);

    // Broadcast
    const io = req.app.get('io');
    if (io) {
      broadcastCollation(io, {
        election_id,
        level: 'ward',
        entity_id: ward_id,
        votes: candidateVotes
      });
    }

    logger.info(`Ward collation completed: ${ward.name} (${collationId})`);

    return ApiResponse.created(res, {
      id: collationId,
      level: 'ward',
      entity_id: ward_id,
      entity_name: ward.name,
      total_polling_units: total_pus,
      reported_polling_units: verifiedResults.length,
      totals,
      candidate_votes: candidateVotes,
      status: 'completed'
    }, 'Ward collation completed successfully');

  } catch (error) {
    await connection.rollback();
    logger.error('Ward collation error:', error);
    return ApiResponse.error(res, 'Failed to complete ward collation');
  } finally {
    connection.release();
  }
}

async function submitLGACollation(req, res) {
  const connection = await pool.getConnection();
  try {
    const userId = req.user.id;
    const { election_id, lga_id } = req.body;

    if (!election_id || !lga_id) {
      return ApiResponse.badRequest(res, 'election_id and lga_id are required');
    }

    // Must be lga_coordinator for this LGA (or higher)
    const userRole = req.user.role;
    if (userRole === 'lga_coordinator' && req.user.lga_id !== lga_id) {
      return ApiResponse.forbidden(res, 'You can only collate results for your assigned LGA');
    }
    if (!['lga_coordinator', 'state_coordinator', 'super_admin'].includes(userRole)) {
      return ApiResponse.forbidden(res, 'Insufficient permissions for LGA collation');
    }

    // Verify election exists
    const [elections] = await pool.query('SELECT id FROM elections WHERE id = ?', [election_id]);
    if (elections.length === 0) {
      return ApiResponse.notFound(res, 'Election not found');
    }

    // Verify LGA exists
    const [lgas] = await pool.query('SELECT id, name FROM lgas WHERE id = ?', [lga_id]);
    if (lgas.length === 0) {
      return ApiResponse.notFound(res, 'LGA not found');
    }
    const lga = lgas[0];

    // Check for existing LGA collation
    const [existingCollation] = await pool.query(
      'SELECT id FROM collation_records WHERE election_id = ? AND level = ? AND entity_id = ? AND status != ?',
      [election_id, 'lga', lga_id, 'rejected']
    );
    if (existingCollation.length > 0) {
      return ApiResponse.conflict(res, 'LGA collation already exists for this election');
    }

    // Get all completed ward collations for this LGA
    const [wardCollations] = await pool.query(`
      SELECT cr.*
      FROM collation_records cr
      JOIN wards w ON cr.entity_id = w.id
      WHERE cr.election_id = ? AND cr.level = 'ward' AND w.lga_id = ? AND cr.status = 'completed'
    `, [election_id, lga_id]);

    // Get total wards in this LGA
    const [[{ total_wards }]] = await pool.query(
      'SELECT COUNT(*) AS total_wards FROM wards WHERE lga_id = ?',
      [lga_id]
    );

    if (wardCollations.length === 0) {
      return ApiResponse.badRequest(res, 'No completed ward collations found for this LGA');
    }

    // Aggregate from ward collations
    const totals = wardCollations.reduce((acc, wc) => {
      acc.registered_voters += wc.total_registered_voters;
      acc.accredited_voters += wc.total_accredited_voters;
      acc.total_votes_cast += wc.total_votes_cast;
      acc.total_valid_votes += wc.total_valid_votes;
      acc.rejected_votes += wc.total_rejected_votes;
      acc.total_pus += wc.total_polling_units;
      acc.reported_pus += wc.reported_polling_units;
      return acc;
    }, { registered_voters: 0, accredited_voters: 0, total_votes_cast: 0, total_valid_votes: 0, rejected_votes: 0, total_pus: 0, reported_pus: 0 });

    // Get candidate vote aggregates from ward collations
    const wardCollationIds = wardCollations.map(wc => wc.id);
    const placeholders = wardCollationIds.map(() => '?').join(',');
    const [candidateVotes] = await pool.query(`
      SELECT cav.candidate_id, c.full_name, c.party_name, c.party_code,
             SUM(cav.total_votes) AS total_votes
      FROM collation_aggregated_votes cav
      JOIN candidates c ON cav.candidate_id = c.id
      WHERE cav.collation_id IN (${placeholders})
      GROUP BY cav.candidate_id, c.full_name, c.party_name, c.party_code
      ORDER BY total_votes DESC
    `, wardCollationIds);

    const contentHash = crypto.createHash('sha256')
      .update(JSON.stringify({ election_id, lga_id, totals, candidateVotes })).digest('hex');
    const timestamp = new Date().toISOString();
    const digitalSignature = crypto.createHmac('sha256', HMAC_SECRET)
      .update(`${JSON.stringify({ election_id, lga_id, totals, candidateVotes })}:${userId}:${new Date().toISOString()}`).digest('hex');

    await connection.beginTransaction();

    const [{ insertId: collationId }] = await connection.query(
      `INSERT INTO collation_records 
        (election_id, level, entity_id, entity_name,
         total_polling_units, reported_polling_units,
         total_registered_voters, total_accredited_voters, total_votes_cast, total_valid_votes, total_rejected_votes,
         digital_signature, status, collated_by, signed_at, created_at, updated_at)
       VALUES (?, 'lga', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, NOW(), NOW(), NOW())`,
      [election_id, lga_id, lga.name,
       totals.total_pus, totals.reported_pus,
       totals.registered_voters, totals.accredited_voters, totals.total_votes_cast,
       totals.total_valid_votes, totals.rejected_votes,
       digitalSignature, userId]
    );

    for (const cv of candidateVotes) {
      await connection.query(
        `INSERT INTO collation_aggregated_votes (collation_id, candidate_id, total_votes)
         VALUES (?, ?, ?)`,
        [collationId, cv.candidate_id, cv.total_votes]
      );
    }

    await connection.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, new_value, ip_address, created_at)
       VALUES (?, ?, 'lga_collation', 'collation_record', ?, ?, ?, NOW())`,
      [uuidv4(), userId, collationId, JSON.stringify({
        lga_id, lga_name: lga.name, total_pus: totals.total_pus, reported: totals.reported_pus
      }), req.ip]
    );

    await connection.commit();

    cache.del('situation_room');
    cache.del('state_dash_latest');
    cache.del(`state_dash_${election_id}`);

    const io = req.app.get('io');
    if (io) {
      broadcastCollation(io, { election_id, level: 'lga', entity_id: lga_id, votes: candidateVotes });
    }

    logger.info(`LGA collation completed: ${lga.name} (${collationId})`);

    return ApiResponse.created(res, {
      id: collationId,
      level: 'lga',
      entity_id: lga_id,
      entity_name: lga.name,
      total_wards,
      reported_wards: wardCollations.length,
      total_polling_units: totals.total_pus,
      reported_polling_units: totals.reported_pus,
      totals,
      candidate_votes: candidateVotes,
      status: 'completed'
    }, 'LGA collation completed successfully');

  } catch (error) {
    await connection.rollback();
    logger.error('LGA collation error:', error);
    return ApiResponse.error(res, 'Failed to complete LGA collation');
  } finally {
    connection.release();
  }
}

async function submitStateCollation(req, res) {
  const connection = await pool.getConnection();
  try {
    const userId = req.user.id;
    const { election_id } = req.body;

    if (!election_id) {
      return ApiResponse.badRequest(res, 'election_id is required');
    }

    // Must be state_coordinator or super_admin
    if (!['state_coordinator', 'super_admin'].includes(req.user.role)) {
      return ApiResponse.forbidden(res, 'Only state coordinators can submit state collation');
    }

    const [elections] = await pool.query('SELECT id FROM elections WHERE id = ?', [election_id]);
    if (elections.length === 0) {
      return ApiResponse.notFound(res, 'Election not found');
    }

    // Check for existing state collation
    const [existingCollation] = await pool.query(
      "SELECT id FROM collation_records WHERE election_id = ? AND level = 'state' AND status != 'rejected'",
      [election_id]
    );
    if (existingCollation.length > 0) {
      return ApiResponse.conflict(res, 'State collation already exists for this election');
    }

    // Get all completed LGA collations
    const [lgaCollations] = await pool.query(
      "SELECT id, total_registered_voters, total_accredited_voters, total_votes_cast, total_valid_votes, total_rejected_votes, total_polling_units, reported_polling_units FROM collation_records WHERE election_id = ? AND level = 'lga' AND status = 'completed'",
      [election_id]
    );

    const [[{ total_lgas }]] = await pool.query('SELECT COUNT(*) AS total_lgas FROM lgas');

    if (lgaCollations.length === 0) {
      return ApiResponse.badRequest(res, 'No completed LGA collations found');
    }

    const totals = lgaCollations.reduce((acc, lc) => {
      acc.registered_voters += lc.total_registered_voters;
      acc.accredited_voters += lc.total_accredited_voters;
      acc.total_votes_cast += lc.total_votes_cast;
      acc.total_valid_votes += lc.total_valid_votes;
      acc.rejected_votes += lc.total_rejected_votes;
      acc.total_pus += lc.total_polling_units;
      acc.reported_pus += lc.reported_polling_units;
      return acc;
    }, { registered_voters: 0, accredited_voters: 0, total_votes_cast: 0, total_valid_votes: 0, rejected_votes: 0, total_pus: 0, reported_pus: 0 });

    const lgaCollationIds = lgaCollations.map(lc => lc.id);
    const placeholders = lgaCollationIds.map(() => '?').join(',');
    const [candidateVotes] = await pool.query(`
      SELECT cav.candidate_id, c.full_name, c.party_name, c.party_code,
             SUM(cav.total_votes) AS total_votes
      FROM collation_aggregated_votes cav
      JOIN candidates c ON cav.candidate_id = c.id
      WHERE cav.collation_id IN (${placeholders})
      GROUP BY cav.candidate_id, c.full_name, c.party_name, c.party_code
      ORDER BY total_votes DESC
    `, lgaCollationIds);

    const digitalSignature = crypto.createHmac('sha256', HMAC_SECRET)
      .update(`${JSON.stringify({ election_id, totals, candidateVotes })}:${userId}:${new Date().toISOString()}`).digest('hex');

    await connection.beginTransaction();

    const [{ insertId: collationId }] = await connection.query(
      `INSERT INTO collation_records 
        (election_id, level, entity_id, entity_name,
         total_polling_units, reported_polling_units,
         total_registered_voters, total_accredited_voters, total_votes_cast, total_valid_votes, total_rejected_votes,
         digital_signature, status, collated_by, signed_at, created_at, updated_at)
       VALUES (?, 'state', ?, 'Jigawa State', ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, NOW(), NOW(), NOW())`,
      [election_id, 1,
       totals.total_pus, totals.reported_pus,
       totals.registered_voters, totals.accredited_voters, totals.total_votes_cast,
       totals.total_valid_votes, totals.rejected_votes,
       digitalSignature, userId]
    );

    for (const cv of candidateVotes) {
      await connection.query(
        `INSERT INTO collation_aggregated_votes (collation_id, candidate_id, total_votes)
         VALUES (?, ?, ?)`,
        [collationId, cv.candidate_id, cv.total_votes]
      );
    }

    await connection.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, new_value, ip_address, created_at)
       VALUES (?, ?, 'state_collation', 'collation_record', ?, ?, ?, NOW())`,
      [uuidv4(), userId, collationId, JSON.stringify({
        election_id, total_pus: totals.total_pus, reported: totals.reported_pus
      }), req.ip]
    );

    await connection.commit();

    cache.del('situation_room');
    cache.del('state_dash_latest');
    cache.del(`state_dash_${election_id}`);

    const io = req.app.get('io');
    if (io) {
      broadcastCollation(io, { election_id, level: 'state', entity_id: 'jigawa', votes: candidateVotes });
    }

    logger.info(`State collation completed: ${collationId}`);

    return ApiResponse.created(res, {
      id: collationId,
      level: 'state',
      entity_name: 'Jigawa State',
      total_lgas,
      reported_lgas: lgaCollations.length,
      total_polling_units: totals.total_pus,
      reported_polling_units: totals.reported_pus,
      totals,
      candidate_votes: candidateVotes,
      status: 'completed'
    }, 'State collation completed successfully');

  } catch (error) {
    await connection.rollback();
    logger.error('State collation error:', error);
    return ApiResponse.error(res, 'Failed to complete state collation');
  } finally {
    connection.release();
  }
}

async function getCollationSummary(req, res) {
  try {
    const { election_id, level } = req.query;

    if (!election_id) {
      return ApiResponse.badRequest(res, 'election_id is required');
    }

    const cacheKey = `collation:summary:${election_id}:${level || 'all'}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return ApiResponse.success(res, cached);
    }

    let query = `
      SELECT cr.*,
             COALESCE(
               JSON_AGG(
                 JSON_BUILD_OBJECT(
                   'candidate_id', cav.candidate_id,
                   'total_votes', cav.total_votes::INTEGER
                 ) ORDER BY cav.total_votes DESC
               ) FILTER (WHERE cav.candidate_id IS NOT NULL),
               '[]'::JSON
             ) AS candidate_votes
      FROM collation_records cr
      LEFT JOIN collation_aggregated_votes cav ON cav.collation_id = cr.id
      WHERE cr.election_id = ?
    `;
    const params = [election_id];

    if (level) {
      query += ' AND cr.level = ?';
      params.push(level);
    }

    query += ` GROUP BY cr.id
      ORDER BY CASE cr.level WHEN 'ward' THEN 1 WHEN 'lga' THEN 2 WHEN 'state' THEN 3 ELSE 4 END,
               cr.entity_name ASC`;

    const [records] = await pool.query(query, params);

    const parsedRecords = records.map((record) => ({
      ...record,
      total_polling_units: Number(record.total_polling_units || 0),
      reported_polling_units: Number(record.reported_polling_units || 0),
      total_registered_voters: Number(record.total_registered_voters || 0),
      total_accredited_voters: Number(record.total_accredited_voters || 0),
      total_votes_cast: Number(record.total_votes_cast || 0),
      total_valid_votes: Number(record.total_valid_votes || 0),
      total_rejected_votes: Number(record.total_rejected_votes || 0),
      candidate_votes: Array.isArray(record.candidate_votes)
        ? record.candidate_votes.map((vote) => ({
            ...vote,
            total_votes: Number(vote.total_votes || 0),
          }))
        : [],
    }));

    // Get summary stats
    const [[stateSummary]] = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM collation_records WHERE election_id = ? AND level = 'ward' AND status = 'completed') AS completed_wards,
        (SELECT COUNT(*) FROM wards) AS total_wards,
        (SELECT COUNT(*) FROM collation_records WHERE election_id = ? AND level = 'lga' AND status = 'completed') AS completed_lgas,
        (SELECT COUNT(*) FROM lgas) AS total_lgas,
        (SELECT COUNT(*) FROM collation_records WHERE election_id = ? AND level = 'state' AND status = 'completed') AS state_completed
    `, [election_id, election_id, election_id]);

    const response = {
      summary: Object.fromEntries(Object.entries(stateSummary || {}).map(([key, value]) => [key, Number(value || 0)])),
      records: parsedRecords
    };

    cache.set(cacheKey, response, 30);

    return ApiResponse.success(res, response);

  } catch (error) {
    logger.error('Get collation summary error:', error);
    return ApiResponse.error(res, 'Failed to fetch collation summary');
  }
}

module.exports = {
  submitWardCollation,
  submitLGACollation,
  submitStateCollation,
  getCollationSummary
};
