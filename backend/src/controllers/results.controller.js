const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { pool, cache } = require('../config/database');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');
const { broadcastResultSubmission, broadcastResultVerified } = require('../websocket/socket.handler');
const notificationService = require('../services/notification.service');

const HMAC_SECRET = process.env.HMAC_SECRET || (process.env.NODE_ENV === 'production' ? null : 'jisems-development-only-hmac-secret');
if (!HMAC_SECRET) throw new Error('HMAC_SECRET is required in production');

function generateContentHash(voteData) {
  const sorted = Object.keys(voteData)
    .sort()
    .reduce((acc, key) => {
      acc[key] = voteData[key];
      return acc;
    }, {});
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

function generateDigitalSignature(contentHash, userId, timestamp) {
  const payload = `${contentHash}:${userId}:${timestamp}`;
  return crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');
}

async function submitResult(req, res) {
  const connection = await pool.getConnection();
  try {
    const userId = req.user.id;
    const {
      election_id,
      polling_unit_id,
      registered_voters,
      accredited_voters,
      total_votes_cast,
      total_valid_votes,
      rejected_votes,
      latitude,
      longitude,
      votes // Array: [{ candidate_id, votes }]
    } = req.body;

    // Parse votes if it's a string (multipart form)
    let parsedVotes = votes;
    if (typeof votes === 'string') {
      try {
        parsedVotes = JSON.parse(votes);
      } catch (e) {
        return ApiResponse.badRequest(res, 'Invalid votes data format');
      }
    }

    // Validate required fields
    if (!election_id || !polling_unit_id || registered_voters === undefined ||
        accredited_voters === undefined || total_votes_cast === undefined ||
        total_valid_votes === undefined || rejected_votes === undefined || !parsedVotes) {
      return ApiResponse.badRequest(res, 'All result fields are required: election_id, polling_unit_id, registered_voters, accredited_voters, total_votes_cast, total_valid_votes, rejected_votes, votes');
    }

    if (!Array.isArray(parsedVotes) || parsedVotes.length === 0) {
      return ApiResponse.badRequest(res, 'votes must be a non-empty array of candidate votes');
    }

    const regVoters = parseInt(registered_voters);
    const accVoters = parseInt(accredited_voters);
    const totalCast = parseInt(total_votes_cast);
    const validVotes = parseInt(total_valid_votes);
    const rejVotes = parseInt(rejected_votes);

    // Validate vote arithmetic
    if (validVotes + rejVotes !== totalCast) {
      return ApiResponse.badRequest(res, `Vote arithmetic error: total_valid_votes (${validVotes}) + rejected_votes (${rejVotes}) must equal total_votes_cast (${totalCast})`);
    }

    // Validate individual candidate votes sum
    const candidateVoteSum = parsedVotes.reduce((sum, v) => sum + parseInt(v.votes || 0), 0);
    if (candidateVoteSum !== validVotes) {
      return ApiResponse.badRequest(res, `Sum of candidate votes (${candidateVoteSum}) must equal total_valid_votes (${validVotes})`);
    }

    // Verify election exists and is ongoing
    const [elections] = await pool.query(
      'SELECT id, election_year FROM elections WHERE id = ? AND status = ?',
      [election_id, 'ongoing']
    );
    if (elections.length === 0) {
      return ApiResponse.notFound(res, 'Election not found or not ongoing');
    }

    // Verify polling unit exists
    const [puRows] = await pool.query(`
      SELECT p.*, w.id AS ward_id, w.code AS ward_code, w.lga_id,
             l.code AS lga_code
      FROM polling_units p
      JOIN wards w ON p.ward_id = w.id
      JOIN lgas l ON w.lga_id = l.id
      WHERE p.id = ?
    `, [polling_unit_id]);
    if (puRows.length === 0) {
      return ApiResponse.notFound(res, 'Polling unit not found');
    }
    const pu = puRows[0];

    // Verify user is assigned to this PU (or has higher role covering this area)
    const userRole = req.user.role;
    let isAuthorized = false;

    if (userRole === 'super_admin' || userRole === 'state_coordinator') {
      isAuthorized = true;
    } else if (userRole === 'lga_coordinator' && req.user.lga_id === pu.lga_id) {
      isAuthorized = true;
    } else if (userRole === 'ward_officer' && req.user.ward_id === pu.ward_id) {
      isAuthorized = true;
    } else if (userRole === 'pu_agent' && Number(req.user.polling_unit_id) === Number(polling_unit_id)) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return ApiResponse.forbidden(res, 'You are not authorized to submit results for this polling unit');
    }

    // Check for duplicate submission
    const [existingSubmissions] = await pool.query(
      'SELECT id, status FROM result_submissions WHERE election_id = ? AND polling_unit_id = ?',
      [election_id, polling_unit_id]
    );
    const existingSubmission = existingSubmissions[0];
    if (existingSubmission && existingSubmission.status !== 'rejected') {
      return ApiResponse.conflict(res, 'A result has already been submitted for this polling unit in this election');
    }

    // Verify all candidate IDs belong to this election
    const candidateIds = parsedVotes.map(v => v.candidate_id);
    const [validCandidates] = await pool.query(
      `SELECT id FROM candidates WHERE election_id = ? AND id IN (${candidateIds.map(() => '?').join(',')})`,
      [election_id, ...candidateIds]
    );
    if (validCandidates.length !== candidateIds.length) {
      return ApiResponse.badRequest(res, 'One or more candidate IDs are invalid for this election');
    }

    // Generate submission UID: JISEMS-{year}-{lga_code}{ward_num}-{pu_num}
    const year = elections[0].election_year || new Date().getFullYear();
    const puCode = pu.code || pu.delimiter_code || '000';
    const submissionUid = `JISEMS-${year}-${pu.lga_code}${pu.ward_code}-${puCode}`;

    // Generate content hash and digital signature
    const voteDataForHash = {
      election_id,
      polling_unit_id,
      registered_voters: regVoters,
      accredited_voters: accVoters,
      total_votes_cast: totalCast,
      total_valid_votes: validVotes,
      rejected_votes: rejVotes,
      candidate_votes: parsedVotes.map(v => ({ candidate_id: v.candidate_id, votes: parseInt(v.votes) }))
    };

    const timestamp = new Date().toISOString();
    const contentHash = generateContentHash(voteDataForHash);
    const digitalSignature = generateDigitalSignature(contentHash, userId, timestamp);

    // Begin transaction
    await connection.beginTransaction();

    let submissionId;
    if (existingSubmission?.status === 'rejected') {
      submissionId = existingSubmission.id;
      await connection.query('DELETE FROM result_sheet_images WHERE submission_id = ?', [submissionId]);
      await connection.query('DELETE FROM vote_data WHERE submission_id = ?', [submissionId]);
      await connection.query('DELETE FROM anomalies WHERE submission_id = ?', [submissionId]);
      await connection.query(
        `UPDATE result_submissions
            SET submitted_by = ?, accredited_voters = ?, total_votes_cast = ?, total_valid_votes = ?,
                rejected_votes = ?, latitude = ?, longitude = ?, content_hash = ?, digital_signature = ?,
                status = 'pending', verified_by = NULL, verified_at = NULL, rejection_reason = NULL,
                flag_reason = NULL, flagged_by = NULL, flagged_at = NULL, is_offline_submission = ?,
                is_anomalous = FALSE, synced_at = NULL, updated_at = NOW()
          WHERE id = ?`,
        [userId, accVoters, totalCast, validVotes, rejVotes, latitude || null, longitude || null,
          contentHash, digitalSignature, Boolean(req.body.is_offline_submission), submissionId]
      );
    } else {
      const [submitResult] = await connection.query(
        `INSERT INTO result_submissions
          (submission_uid, election_id, polling_unit_id, ward_id, lga_id,
           submitted_by, accredited_voters, total_votes_cast,
           total_valid_votes, rejected_votes, latitude, longitude, content_hash, digital_signature,
           status, is_offline_submission, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [submissionUid, election_id, polling_unit_id, pu.ward_id, pu.lga_id,
          userId, accVoters, totalCast, validVotes, rejVotes, latitude || null, longitude || null,
          contentHash, digitalSignature, 'pending', Boolean(req.body.is_offline_submission)]
      );
      submissionId = submitResult.insertId;
      if (!submissionId) {
        const conflict = new Error('A result has already been submitted for this polling unit in this election');
        conflict.statusCode = 409;
        throw conflict;
      }
    }

    // Insert result_sheet_images for each uploaded file
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const imageUrl = `/uploads/results/${file.filename}`;
        await connection.query(
          `INSERT INTO result_sheet_images (submission_id, image_url, image_type, file_size, created_at)
           VALUES (?, ?, 'ec8a_front', ?, NOW())`,
          [submissionId, imageUrl, file.size]
        );
      }
    }

    // Insert vote_data rows for each candidate
    for (const vote of parsedVotes) {
      await connection.query(
        `INSERT INTO vote_data (submission_id, candidate_id, votes, created_at)
         VALUES (?, ?, ?, NOW())`,
        [submissionId, vote.candidate_id, parseInt(vote.votes)]
      );
    }

    // Audit log
    await connection.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, old_value, ip_address, created_at)
       VALUES (?, ?, 'submit_result', 'result_submission', ?, ?, ?, NOW())`,
      [uuidv4(), userId, submissionId, JSON.stringify({
        submission_uid: submissionUid,
        polling_unit_id,
        total_votes_cast: totalCast,
        content_hash: contentHash
      }), req.ip]
    );

    await connection.commit();
    
    // ANOMALY DETECTION ENGINE
    const AnomalyService = require('../services/anomaly.service');
    const anomalies = await AnomalyService.analyzeResult(submissionId, {
      accredited_voters: accVoters,
      total_votes_cast: totalCast
    }, regVoters, parsedVotes);

    if (anomalies.length > 0) {
      // Trigger auto-dispute for anomalies
      const connection2 = await pool.getConnection();
      try {
        await connection2.query(
          `INSERT INTO disputes (election_id, submission_id, raised_by, title, description, category, priority, escalation_level, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'ward', 'open')`,
          [election_id, submissionId, userId, 'System Auto-Flag: Anomaly Detected', anomalies.map(a => a.detail).join(' | '), 'fraud', 'high']
        );
      } catch (err) {
        logger.error('Failed to auto-raise dispute for anomaly:', err);
      } finally {
        connection2.release();
      }
    }

    // Invalidate the keys used by the live dashboards.
    cache.del('situation_room');
    cache.del('state_dash_latest');
    cache.del(`state_dash_${election_id}`);

    // Broadcast via Socket.io
    const io = req.app.get('io');
    if (io) {
      broadcastResultSubmission(io, {
        id: submissionId,
        election_id,
        polling_unit_id,
        ward_id: pu.ward_id,
        lga_id: pu.lga_id,
        status: 'pending'
      });
    }

    // Get full submission data to return
    const [submission] = await pool.query(`
      SELECT rs.*, 
             p.name AS polling_unit_name, w.name AS ward_name, l.name AS lga_name,
             u.first_name AS submitter_first_name, u.last_name AS submitter_last_name
      FROM result_submissions rs
      JOIN polling_units p ON rs.polling_unit_id = p.id
      JOIN wards w ON rs.ward_id = w.id
      JOIN lgas l ON rs.lga_id = l.id
      JOIN users u ON rs.submitted_by = u.id
      WHERE rs.id = ?
    `, [submissionId]);

    const [submittedVotes] = await pool.query(`
      SELECT vd.*, c.full_name, c.party_name, c.party_code
      FROM vote_data vd
      JOIN candidates c ON vd.candidate_id = c.id
      WHERE vd.submission_id = ?
    `, [submissionId]);

    const [images] = await pool.query(
      'SELECT id, image_url, image_type, file_size FROM result_sheet_images WHERE submission_id = ?',
      [submissionId]
    );

    const result = submission[0];
    result.votes = submittedVotes;
    result.images = images;

    logger.info(`Result submitted: ${submissionUid} by user ${userId}`);

    return ApiResponse.created(res, result, 'Result submitted successfully');

  } catch (error) {
    await connection.rollback();
    if (error.statusCode === 409) {
      return ApiResponse.conflict(res, error.message);
    }
    logger.error('Submit result error:', error);
    return ApiResponse.error(res, 'Failed to submit result');
  } finally {
    connection.release();
  }
}

async function listResults(req, res) {
  try {
    const { election_id, lga_id, ward_id, status, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    let countQuery = `
      SELECT COUNT(*) AS total
      FROM result_submissions rs
      JOIN polling_units p ON rs.polling_unit_id = p.id
      JOIN wards w ON rs.ward_id = w.id
      JOIN lgas l ON rs.lga_id = l.id
    `;

    let dataQuery = `
      SELECT rs.id, rs.submission_uid, rs.election_id, rs.polling_unit_id, rs.ward_id, rs.lga_id,
             rs.submitted_by, p.registered_voters AS pu_registered_voters, rs.accredited_voters, rs.total_votes_cast,
             rs.total_valid_votes, rs.rejected_votes, rs.status, rs.is_offline_submission, rs.created_at,
             p.name AS polling_unit_name, p.code AS polling_unit_code,
             w.name AS ward_name, l.name AS lga_name,
             u.first_name AS submitter_first_name, u.last_name AS submitter_last_name
      FROM result_submissions rs
      JOIN polling_units p ON rs.polling_unit_id = p.id
      JOIN wards w ON rs.ward_id = w.id
      JOIN lgas l ON rs.lga_id = l.id
      JOIN users u ON rs.submitted_by = u.id
    `;

    const conditions = [];
    const params = [];

    // Role-based scoping
    const userRole = req.user.role;
    if (userRole === 'ward_officer') {
      conditions.push('rs.ward_id = ?');
      params.push(req.user.ward_id);
    } else if (userRole === 'lga_coordinator') {
      conditions.push('rs.lga_id = ?');
      params.push(req.user.lga_id);
    } else if (userRole === 'pu_agent') {
      conditions.push('rs.submitted_by = ?');
      params.push(req.user.id);
    }
    // super_admin and state_coordinator see all

    if (election_id) {
      conditions.push('rs.election_id = ?');
      params.push(election_id);
    }

    if (lga_id) {
      conditions.push('rs.lga_id = ?');
      params.push(lga_id);
    }

    if (ward_id) {
      conditions.push('rs.ward_id = ?');
      params.push(ward_id);
    }

    if (status) {
      conditions.push('rs.status = ?');
      params.push(status);
    }

    if (conditions.length > 0) {
      const where = ' WHERE ' + conditions.join(' AND ');
      countQuery += where;
      dataQuery += where;
    }

    dataQuery += ' ORDER BY rs.created_at DESC LIMIT ? OFFSET ?';

    const countParams = [...params];
    params.push(limitNum, offset);

    const [[{ total }]] = await pool.query(countQuery, countParams);
    const [results] = await pool.query(dataQuery, params);

    return ApiResponse.paginated(res, results, { page: pageNum, limit: limitNum, total });

  } catch (error) {
    logger.error('List results error:', error);
    return ApiResponse.error(res, 'Failed to fetch results');
  }
}

async function getResult(req, res) {
  try {
    const { id } = req.params;

    const [submissions] = await pool.query(`
      SELECT rs.*,
             p.name AS polling_unit_name, p.code AS polling_unit_code, p.registered_voters AS pu_registered_voters,
             w.name AS ward_name, w.code AS ward_code,
             l.name AS lga_name, l.code AS lga_code,
             u.first_name AS submitter_first_name, u.last_name AS submitter_last_name,
             u.phone AS submitter_phone, u.email AS submitter_email,
             vu.first_name AS verifier_first_name, vu.last_name AS verifier_last_name
      FROM result_submissions rs
      JOIN polling_units p ON rs.polling_unit_id = p.id
      JOIN wards w ON rs.ward_id = w.id
      JOIN lgas l ON rs.lga_id = l.id
      JOIN users u ON rs.submitted_by = u.id
      LEFT JOIN users vu ON rs.verified_by = vu.id
      WHERE rs.id = ?
    `, [id]);

    if (submissions.length === 0) {
      return ApiResponse.notFound(res, 'Result submission not found');
    }

    const result = submissions[0];

    // Get votes
    const [votes] = await pool.query(`
      SELECT vd.*, c.full_name, c.party_name, c.party_code, c.photo_url AS candidate_photo
      FROM vote_data vd
      JOIN candidates c ON vd.candidate_id = c.id
      WHERE vd.submission_id = ?
      ORDER BY vd.votes DESC
    `, [id]);

    // Get images
    const [images] = await pool.query(
      'SELECT id, image_url, image_type, file_size FROM result_sheet_images WHERE submission_id = ? ORDER BY created_at ASC',
      [id]
    );

    result.votes = votes;
    result.images = images;

    // Only privileged roles or the submitter can view submitter contact details
    const canViewPii = ['super_admin', 'state_coordinator'].includes(req.user.role) || req.user.id === result.submitted_by;
    if (!canViewPii) {
      delete result.submitter_phone;
      delete result.submitter_email;
    }

    return ApiResponse.success(res, result);

  } catch (error) {
    logger.error('Get result error:', error);
    return ApiResponse.error(res, 'Failed to fetch result');
  }
}

function invalidateResultCaches(cacheStore, electionId, lgaId, wardId) {
  cacheStore.del('situation_room');
  cacheStore.del('state_dash_latest');
  cacheStore.del(`state_dash_${electionId}`);
  if (lgaId !== undefined && lgaId !== null) cacheStore.del(`lga_dash_${lgaId}_${electionId}`);
  if (wardId !== undefined && wardId !== null) cacheStore.del(`ward_dash_${wardId}_${electionId}`);
}

async function verifyResult(req, res) {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Only ward_officer, lga_coordinator, state_coordinator, super_admin can verify
    const verifyRoles = ['ward_officer', 'lga_coordinator', 'state_coordinator', 'super_admin'];
    if (!verifyRoles.includes(userRole)) {
      return ApiResponse.forbidden(res, 'You do not have permission to verify results');
    }

    const [submissions] = await pool.query(
      'SELECT id, status, ward_id, lga_id, submission_uid, submitted_by, election_id, polling_unit_id FROM result_submissions WHERE id = ?',
      [id]
    );

    if (submissions.length === 0) {
      return ApiResponse.notFound(res, 'Result submission not found');
    }

    const submission = submissions[0];

    if (submission.status === 'verified') {
      return ApiResponse.badRequest(res, 'Result is already verified');
    }

    if (submission.status === 'rejected') {
      return ApiResponse.badRequest(res, 'Cannot verify a rejected result');
    }

    // Role-based jurisdiction check
    if (userRole === 'ward_officer' && req.user.ward_id !== submission.ward_id) {
      return ApiResponse.forbidden(res, 'You can only verify results in your ward');
    }
    if (userRole === 'lga_coordinator' && req.user.lga_id !== submission.lga_id) {
      return ApiResponse.forbidden(res, 'You can only verify results in your LGA');
    }

    await pool.query(
      `UPDATE result_submissions SET status = 'verified', verified_by = ?, verified_at = NOW(),
       updated_at = NOW() WHERE id = ?`,
      [userId, id]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, new_value, ip_address, created_at)
       VALUES (?, ?, 'verify_result', 'result_submission', ?, ?, ?, NOW())`,
      [uuidv4(), userId, id, JSON.stringify({ submission_uid: submission.submission_uid }), req.ip]
    );

    // Invalidate public, state, LGA, and ward dashboard caches.
    invalidateResultCaches(cache, submission.election_id, submission.lga_id, submission.ward_id);

    // Broadcast verified event
    const io = req.app.get('io');
    if (io) {
      // Get votes for broadcast
      const [votes] = await pool.query(
        'SELECT candidate_id, votes FROM vote_data WHERE submission_id = ?',
        [id]
      );
      broadcastResultVerified(io, {
        id,
        election_id: submission.election_id,
        polling_unit_id: submission.polling_unit_id,
        ward_id: submission.ward_id,
        lga_id: submission.lga_id,
        votes
      });
    }

    // Create notification for submitter
    await notificationService.notify(
      submission.submitted_by,
      'Result Verified',
      `Your result submission ${submission.submission_uid} has been verified.`,
      'result_verified',
      'result_submission',
      id
    );

    logger.info(`Result verified: ${id} by user ${userId}`);

    return ApiResponse.success(res, { id, status: 'verified' }, 'Result verified successfully');

  } catch (error) {
    logger.error('Verify result error:', error);
    return ApiResponse.error(res, 'Failed to verify result');
  }
}

async function rejectResult(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    if (!reason) {
      return ApiResponse.badRequest(res, 'Rejection reason is required');
    }

    const rejectRoles = ['ward_officer', 'lga_coordinator', 'state_coordinator', 'super_admin'];
    if (!rejectRoles.includes(req.user.role)) {
      return ApiResponse.forbidden(res, 'You do not have permission to reject results');
    }

    const [submissions] = await pool.query(
      'SELECT id, status, ward_id, lga_id, submission_uid, submitted_by FROM result_submissions WHERE id = ?',
      [id]
    );

    if (submissions.length === 0) {
      return ApiResponse.notFound(res, 'Result submission not found');
    }

    const submission = submissions[0];

    if (submission.status === 'rejected') {
      return ApiResponse.badRequest(res, 'Result is already rejected');
    }

    // Jurisdiction check
    if (req.user.role === 'ward_officer' && req.user.ward_id !== submission.ward_id) {
      return ApiResponse.forbidden(res, 'You can only reject results in your ward');
    }
    if (req.user.role === 'lga_coordinator' && req.user.lga_id !== submission.lga_id) {
      return ApiResponse.forbidden(res, 'You can only reject results in your LGA');
    }

    await pool.query(
      `UPDATE result_submissions SET status = 'rejected', rejection_reason = ?, 
       verified_by = ?, verified_at = NOW(), updated_at = NOW() WHERE id = ?`,
      [reason, userId, id]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, new_value, ip_address, created_at)
       VALUES (?, ?, 'reject_result', 'result_submission', ?, ?, ?, NOW())`,
      [uuidv4(), userId, id, JSON.stringify({ submission_uid: submission.submission_uid, reason }), req.ip]
    );

    // Invalidate public, state, LGA, and ward dashboard caches.
    invalidateResultCaches(cache, submission.election_id, submission.lga_id, submission.ward_id);

    // Notify submitter
    await notificationService.notify(
      submission.submitted_by,
      'Result Rejected',
      `Your result submission ${submission.submission_uid} was rejected. Reason: ${reason}`,
      'result_rejected',
      'result_submission',
      id
    );

    logger.info(`Result rejected: ${id} by user ${userId}. Reason: ${reason}`);

    return ApiResponse.success(res, { id, status: 'rejected', reason }, 'Result rejected');

  } catch (error) {
    logger.error('Reject result error:', error);
    return ApiResponse.error(res, 'Failed to reject result');
  }
}

async function flagResult(req, res) {
  try {
    const { id } = req.params;
    const { reason, flag_type } = req.body;
    const userId = req.user.id;

    if (!reason) {
      return ApiResponse.badRequest(res, 'Flag reason is required');
    }

    const [submissions] = await pool.query(
      'SELECT id, status, ward_id, lga_id, submission_uid, submitted_by, election_id, polling_unit_id FROM result_submissions WHERE id = ?',
      [id]
    );

    if (submissions.length === 0) {
      return ApiResponse.notFound(res, 'Result submission not found');
    }

    const submission = submissions[0];

    await pool.query(
      `UPDATE result_submissions SET status = 'flagged', flag_reason = ?, flagged_by = ?,
       flagged_at = NOW(), updated_at = NOW() WHERE id = ?`,
      [reason, userId, id]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, new_value, ip_address, created_at)
       VALUES (?, ?, 'flag_result', 'result_submission', ?, ?, ?, NOW())`,
      [uuidv4(), userId, id, JSON.stringify({ reason, flag_type: flag_type || 'suspicious' }), req.ip]
    );

    // Invalidate public, state, LGA, and ward dashboard caches.
    invalidateResultCaches(cache, submission.election_id, submission.lga_id, submission.ward_id);

    // Notify admin users
    const [admins] = await pool.query(
      "SELECT id FROM users WHERE role IN ('super_admin', 'state_coordinator') AND status = 'active'"
    );
    for (const admin of admins) {
      await notificationService.notify(
        admin.id,
        'Result Flagged',
        `Result ${submission.submission_uid} has been flagged as suspicious. Reason: ${reason}`,
        'system',
        'result_submission',
        id
      );
    }

    logger.info(`Result flagged: ${id} by user ${userId}. Reason: ${reason}`);

    return ApiResponse.success(res, { id, status: 'flagged', reason }, 'Result flagged successfully');

  } catch (error) {
    logger.error('Flag result error:', error);
    return ApiResponse.error(res, 'Failed to flag result');
  }
}

module.exports = {
  submitResult,
  listResults,
  getResult,
  verifyResult,
  rejectResult,
  flagResult
};
