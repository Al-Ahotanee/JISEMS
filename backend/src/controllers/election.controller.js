const { v4: uuidv4 } = require('uuid');
const { pool, cache } = require('../config/database');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

async function listElections(req, res) {
  try {
    const { status, year } = req.query;

    let query = `
      SELECT 
        e.*,
        (SELECT COUNT(*) FROM candidates c WHERE c.election_id = e.id) AS candidate_count,
        (SELECT COUNT(*) FROM result_submissions rs WHERE rs.election_id = e.id) AS submission_count
      FROM elections e
    `;
    const conditions = [];
    const params = [];

    if (status) {
      conditions.push('e.status = ?');
      params.push(status);
    }

    if (year) {
      conditions.push('e.election_year = ?');
      params.push(year);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY e.election_date DESC';

    const [elections] = await pool.query(query, params);
    const normalizedElections = elections.map((election) => ({
      ...election,
      candidate_count: Number(election.candidate_count || 0),
      submission_count: Number(election.submission_count || 0),
      election_year: Number(election.election_year || 0),
    }));

    return ApiResponse.success(res, normalizedElections);

  } catch (error) {
    logger.error('List elections error:', error);
    return ApiResponse.error(res, 'Failed to fetch elections');
  }
}

async function getElection(req, res) {
  try {
    const { id } = req.params;

    const [elections] = await pool.query(
      'SELECT id, title, election_type, election_date, election_year, description, status, created_at, updated_at FROM elections WHERE id = ?',
      [id]
    );

    if (elections.length === 0) {
      return ApiResponse.notFound(res, 'Election not found');
    }

    const election = elections[0];

    // Get candidates for this election
    const [candidates] = await pool.query(`
      SELECT 
        c.*,
        COALESCE(SUM(vd.votes), 0) AS total_votes
      FROM candidates c
      LEFT JOIN vote_data vd ON vd.candidate_id = c.id 
        AND vd.submission_id IN (
          SELECT rs.id FROM result_submissions rs 
          WHERE rs.election_id = ? AND rs.status = 'verified'
        )
      WHERE c.election_id = ?
      GROUP BY c.id
      ORDER BY total_votes DESC
    `, [id, id]);

    election.candidates = candidates.map((candidate) => ({
      ...candidate,
      total_votes: Number(candidate.total_votes || 0),
    }));

    return ApiResponse.success(res, election);

  } catch (error) {
    logger.error('Get election error:', error);
    return ApiResponse.error(res, 'Failed to fetch election');
  }
}

async function createElection(req, res) {
  try {
    const { title, election_type, election_date, election_year, description, status } = req.body;

    if (!title || !election_type || !election_date || !election_year) {
      return ApiResponse.badRequest(res, 'title, election_type, election_date, and election_year are required');
    }

    // Only super_admin can create elections
    if (req.user.role !== 'super_admin') {
      return ApiResponse.forbidden(res, 'Only super administrators can create elections');
    }

    const [{ insertId: electionId }] = await pool.query(
      `INSERT INTO elections (title, election_type, election_date, election_year, description, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [title, election_type, election_date, election_year, description || null, status || 'upcoming', req.user.id]
    );
    if (!electionId) throw new Error('Election id was not returned after insert');

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, new_value, ip_address, created_at)
       VALUES (?, ?, 'create', 'election', ?, ?, ?, NOW())`,
      [uuidv4(), req.user.id, electionId, JSON.stringify({ title, election_type }), req.ip]
    );

    const [created] = await pool.query('SELECT id, title, election_type, election_date, election_year, description, status, created_at, updated_at FROM elections WHERE id = ?', [electionId]);

    logger.info(`Election created: ${electionId} by user ${req.user.id}`);

    return ApiResponse.created(res, created[0], 'Election created successfully');

  } catch (error) {
    logger.error('Create election error:', error);
    return ApiResponse.error(res, 'Failed to create election');
  }
}

async function updateElection(req, res) {
  try {
    const { id } = req.params;
    const { title, election_type, election_date, election_year, description, status } = req.body;

    // Check if election exists
    const [existing] = await pool.query('SELECT id FROM elections WHERE id = ?', [id]);
    if (existing.length === 0) {
      return ApiResponse.notFound(res, 'Election not found');
    }

    const updates = [];
    const params = [];

    if (title !== undefined) { updates.push('title = ?'); params.push(title); }
    if (election_type !== undefined) { updates.push('election_type = ?'); params.push(election_type); }
    if (election_date !== undefined) { updates.push('election_date = ?'); params.push(election_date); }
    if (election_year !== undefined) { updates.push('election_year = ?'); params.push(election_year); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }

    if (updates.length === 0) {
      return ApiResponse.badRequest(res, 'No fields to update');
    }

    updates.push('updated_at = NOW()');
    params.push(id);

    await pool.query(
      `UPDATE elections SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, new_value, ip_address, created_at)
       VALUES (?, ?, 'update', 'election', ?, ?, ?, NOW())`,
      [uuidv4(), req.user.id, id, JSON.stringify(req.body), req.ip]
    );

    const [updated] = await pool.query('SELECT id, title, election_type, election_date, election_year, description, status, created_at, updated_at FROM elections WHERE id = ?', [id]);

    // Clear related caches
    cache.del('situation_room');
    cache.del('state_dash_latest');
    cache.del(`state_dash_${id}`);

    return ApiResponse.success(res, updated[0], 'Election updated successfully');

  } catch (error) {
    logger.error('Update election error:', error);
    return ApiResponse.error(res, 'Failed to update election');
  }
}

async function listCandidates(req, res) {
  try {
    const election_id = req.params.electionId || req.params.election_id;

    // Verify election exists
    const [elections] = await pool.query('SELECT id FROM elections WHERE id = ?', [election_id]);
    if (elections.length === 0) {
      return ApiResponse.notFound(res, 'Election not found');
    }

    const [candidates] = await pool.query(`
      SELECT 
        c.*,
        COALESCE(SUM(vd.votes), 0) AS total_votes
      FROM candidates c
      LEFT JOIN vote_data vd ON vd.candidate_id = c.id 
        AND vd.submission_id IN (
          SELECT rs.id FROM result_submissions rs 
          WHERE rs.election_id = ? AND rs.status = 'verified'
        )
      WHERE c.election_id = ?
      GROUP BY c.id
      ORDER BY c.party_name ASC
    `, [election_id, election_id]);

    return ApiResponse.success(res, candidates.map((candidate) => ({
      ...candidate,
      total_votes: Number(candidate.total_votes || 0),
    })));

  } catch (error) {
    logger.error('List candidates error:', error);
    return ApiResponse.error(res, 'Failed to fetch candidates');
  }
}

async function createCandidate(req, res) {
  try {
    const election_id = req.params.electionId || req.params.election_id;
    const { candidate_name, party_name, party_code, photo_url } = req.body;

    if (!candidate_name || !party_name || !party_code) {
      return ApiResponse.badRequest(res, 'candidate_name, party_name, and party_code are required');
    }

    // Verify election exists
    const [elections] = await pool.query('SELECT id FROM elections WHERE id = ?', [election_id]);
    if (elections.length === 0) {
      return ApiResponse.notFound(res, 'Election not found');
    }

    // Check for duplicate party in this election
    const [existingParty] = await pool.query(
      'SELECT id FROM candidates WHERE election_id = ? AND party_code = ?',
      [election_id, party_code]
    );
    if (existingParty.length > 0) {
      return ApiResponse.conflict(res, `A candidate from ${party_code} already exists for this election`);
    }

    const [{ insertId: candidateId }] = await pool.query(
      `INSERT INTO candidates (election_id, full_name, party_name, party_code, photo_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [election_id, candidate_name, party_name, party_code, photo_url || null]
    );
    if (!candidateId) throw new Error('Candidate id was not returned after insert');

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, new_value, ip_address, created_at)
       VALUES (?, ?, 'create', 'candidate', ?, ?, ?, NOW())`,
      [uuidv4(), req.user.id, candidateId, JSON.stringify({ candidate_name, party_code, election_id }), req.ip]
    );

    const [created] = await pool.query('SELECT id, election_id, full_name, party_code, party_name, photo_url, position, created_at FROM candidates WHERE id = ?', [candidateId]);

    logger.info(`Candidate created: ${candidateId} for election ${election_id}`);

    return ApiResponse.created(res, created[0], 'Candidate added successfully');

  } catch (error) {
    logger.error('Create candidate error:', error);
    return ApiResponse.error(res, 'Failed to add candidate');
  }
}

async function updateCandidate(req, res) {
  try {
    const { id } = req.params;
    const { candidate_name, party_name, party_code, photo_url } = req.body;

    const [existing] = await pool.query('SELECT id FROM candidates WHERE id = ?', [id]);
    if (existing.length === 0) {
      return ApiResponse.notFound(res, 'Candidate not found');
    }

    const updates = [];
    const params = [];

    if (candidate_name !== undefined) { updates.push('full_name = ?'); params.push(candidate_name); }
    if (party_name !== undefined) { updates.push('party_name = ?'); params.push(party_name); }
    if (party_code !== undefined) { updates.push('party_code = ?'); params.push(party_code); }
    if (photo_url !== undefined) { updates.push('photo_url = ?'); params.push(photo_url); }

    if (updates.length === 0) {
      return ApiResponse.badRequest(res, 'No fields to update');
    }

    updates.push('updated_at = NOW()');
    params.push(id);

    await pool.query(`UPDATE candidates SET ${updates.join(', ')} WHERE id = ?`, params);

    const [updated] = await pool.query('SELECT id, election_id, full_name, party_code, party_name, photo_url, position, created_at FROM candidates WHERE id = ?', [id]);

    return ApiResponse.success(res, updated[0], 'Candidate updated successfully');

  } catch (error) {
    logger.error('Update candidate error:', error);
    return ApiResponse.error(res, 'Failed to update candidate');
  }
}

async function deleteCandidate(req, res) {
  try {
    const { id } = req.params;

    const [existing] = await pool.query('SELECT id, full_name FROM candidates WHERE id = ?', [id]);
    if (existing.length === 0) {
      return ApiResponse.notFound(res, 'Candidate not found');
    }

    // Check if candidate has any votes recorded
    const [votes] = await pool.query('SELECT COUNT(*) AS count FROM vote_data WHERE candidate_id = ?', [id]);
    if (Number(votes[0]?.count || 0) > 0) {
      return ApiResponse.badRequest(res, 'Cannot delete candidate with recorded votes. Remove vote data first.');
    }

    await pool.query('DELETE FROM candidates WHERE id = ?', [id]);

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, new_value, ip_address, created_at)
       VALUES (?, ?, 'delete', 'candidate', ?, ?, ?, NOW())`,
      [uuidv4(), req.user.id, id, JSON.stringify({ candidate_name: existing[0].full_name }), req.ip]
    );

    logger.info(`Candidate deleted: ${id}`);

    return ApiResponse.success(res, null, 'Candidate deleted successfully');

  } catch (error) {
    logger.error('Delete candidate error:', error);
    return ApiResponse.error(res, 'Failed to delete candidate');
  }
}

module.exports = {
  listElections,
  getElection,
  createElection,
  updateElection,
  listCandidates,
  createCandidate,
  updateCandidate,
  deleteCandidate
};
