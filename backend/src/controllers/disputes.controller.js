const { pool } = require('../config/database');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');
const notificationService = require('../services/notification.service');

const raiseDispute = async (req, res) => {
  try {
    const { election_id, submission_id, title, description, category, priority } = req.body;
    if (!title || !description || !category) {
      return ApiResponse.badRequest(res, 'Title, description, and category are required');
    }

    // Get election
    let elId = election_id;
    if (!elId) {
      const [els] = await pool.query("SELECT id FROM elections WHERE status = 'ongoing' ORDER BY election_date DESC LIMIT 1");
      if (els.length) elId = els[0].id;
      else return ApiResponse.badRequest(res, 'No active election found');
    }

    const [result] = await pool.query(
      `INSERT INTO disputes (election_id, submission_id, raised_by, title, description, category, priority, escalation_level)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ward')`,
      [elId, submission_id || null, req.user.id, title, description, category, priority || 'medium']
    );

    // Notify ward officers
    notificationService.notifyByRole('ward_officer', 'New Dispute Raised', `${title}`, 'dispute_raised', 'dispute', result.insertId);

    return ApiResponse.created(res, { id: result.insertId }, 'Dispute raised successfully');
  } catch (error) {
    logger.error('Raise dispute error:', error);
    return ApiResponse.error(res, 'Failed to raise dispute');
  }
};

const listDisputes = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, priority, category, escalation_level, election_id } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = [];

    if (status) { where += ' AND d.status = ?'; params.push(status); }
    if (priority) { where += ' AND d.priority = ?'; params.push(priority); }
    if (category) { where += ' AND d.category = ?'; params.push(category); }
    if (escalation_level) { where += ' AND d.escalation_level = ?'; params.push(escalation_level); }
    if (election_id) { where += ' AND d.election_id = ?'; params.push(parseInt(election_id)); }

    // Role scoping
    if (req.user.role === 'ward_officer' && req.user.ward_id) {
      where += ' AND (d.submission_id IN (SELECT id FROM result_submissions WHERE ward_id = ?) OR (d.submission_id IS NULL AND d.raised_by = ?))';
      params.push(req.user.ward_id, req.user.id);
    } else if (req.user.role === 'lga_coordinator' && req.user.lga_id) {
      where += ' AND (d.submission_id IN (SELECT id FROM result_submissions WHERE lga_id = ?) OR (d.submission_id IS NULL AND d.raised_by = ?))';
      params.push(req.user.lga_id, req.user.id);
    } else if (req.user.role === 'pu_agent') {
      where += ' AND d.raised_by = ?';
      params.push(req.user.id);
    }

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM disputes d ${where}`, params);
    const total = Number(countResult[0]?.total || 0);

    const [disputes] = await pool.query(
      `SELECT d.*, CONCAT(u.first_name, ' ', u.last_name) as raiser_name,
              rs.submission_uid
       FROM disputes d
       JOIN users u ON u.id = d.raised_by
       LEFT JOIN result_submissions rs ON rs.id = d.submission_id
       ${where} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    return ApiResponse.paginated(res, disputes, { page: parseInt(page), limit: parseInt(limit), total });
  } catch (error) {
    logger.error('List disputes error:', error);
    return ApiResponse.error(res, 'Failed to list disputes');
  }
};

const getDispute = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [disputes] = await pool.query(
      `SELECT d.*, CONCAT(u1.first_name, ' ', u1.last_name) as raiser_name,
              CONCAT(u2.first_name, ' ', u2.last_name) as assignee_name,
              CONCAT(u3.first_name, ' ', u3.last_name) as resolver_name,
              rs.submission_uid
       FROM disputes d
       JOIN users u1 ON u1.id = d.raised_by
       LEFT JOIN users u2 ON u2.id = d.assigned_to
       LEFT JOIN users u3 ON u3.id = d.resolved_by
       LEFT JOIN result_submissions rs ON rs.id = d.submission_id
       WHERE d.id = ?`,
      [id]
    );
    if (!disputes.length) return ApiResponse.notFound(res, 'Dispute not found');

    const [comments] = await pool.query(
      `SELECT dc.*, CONCAT(u.first_name, ' ', u.last_name) as user_name, u.role as user_role
       FROM dispute_comments dc JOIN users u ON u.id = dc.user_id WHERE dc.dispute_id = ? ORDER BY dc.created_at`,
      [id]
    );

    const [evidence] = await pool.query(
      `SELECT de.*, CONCAT(u.first_name, ' ', u.last_name) as uploader_name
       FROM dispute_evidence de JOIN users u ON u.id = de.uploaded_by WHERE de.dispute_id = ? ORDER BY de.created_at`,
      [id]
    );

    return ApiResponse.success(res, { ...disputes[0], comments, evidence });
  } catch (error) {
    logger.error('Get dispute error:', error);
    return ApiResponse.error(res, 'Failed to get dispute');
  }
};

const addComment = async (req, res) => {
  try {
    const disputeId = parseInt(req.params.id);
    const { comment } = req.body;
    if (!comment) return ApiResponse.badRequest(res, 'Comment is required');

    await pool.query(
      'INSERT INTO dispute_comments (dispute_id, user_id, comment) VALUES (?, ?, ?)',
      [disputeId, req.user.id, comment]
    );
    return ApiResponse.created(res, null, 'Comment added');
  } catch (error) {
    logger.error('Add comment error:', error);
    return ApiResponse.error(res, 'Failed to add comment');
  }
};

const addEvidence = async (req, res) => {
  try {
    const disputeId = parseInt(req.params.id);
    if (!req.files || !req.files.length) return ApiResponse.badRequest(res, 'No files uploaded');

    for (const file of req.files) {
      await pool.query(
        'INSERT INTO dispute_evidence (dispute_id, uploaded_by, file_url, file_type, description) VALUES (?, ?, ?, ?, ?)',
        [disputeId, req.user.id, `/uploads/evidence/${file.filename}`, file.mimetype, req.body.description || '']
      );
    }
    return ApiResponse.created(res, null, 'Evidence uploaded');
  } catch (error) {
    logger.error('Add evidence error:', error);
    return ApiResponse.error(res, 'Failed to upload evidence');
  }
};

const resolveDispute = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { resolution_notes, status } = req.body;
    const validStatuses = ['open', 'security_alerted', 'investigating', 'resolved', 'dismissed', 'escalated'];
    const finalStatus = status && validStatuses.includes(status) ? status : 'resolved';

    await pool.query(
      'UPDATE disputes SET status = ?, resolution_notes = ?, resolved_by = ?, resolved_at = NOW(), updated_at = NOW() WHERE id = ?',
      [finalStatus, resolution_notes || '', req.user.id, id]
    );

    const statusLabels = {
      security_alerted: 'Security Forces & Rapid Response Alerted',
      investigating: 'Electoral Investigation Dispatched',
      resolved: 'Dispute Marked as Resolved',
      dismissed: 'Dispute Reviewed and Dismissed',
      escalated: 'Dispute Escalated to Higher Jurisdiction',
    };
    const logText = `[SLA Transition] Status updated to: ${statusLabels[finalStatus] || finalStatus}.${resolution_notes ? ` Notes: ${resolution_notes}` : ''}`;
    await pool.query(
      'INSERT INTO dispute_comments (dispute_id, user_id, comment) VALUES (?, ?, ?)',
      [id, req.user.id, logText]
    );

    const [dispute] = await pool.query('SELECT raised_by, title FROM disputes WHERE id = ?', [id]);
    if (dispute.length) {
      notificationService.notify(
        dispute[0].raised_by,
        `Dispute Status: ${finalStatus.toUpperCase()}`,
        `Your dispute "${dispute[0].title}" is now: ${statusLabels[finalStatus] || finalStatus}`,
        'dispute_update',
        'dispute',
        id
      );
    }

    return ApiResponse.success(res, { status: finalStatus }, `Dispute updated to ${finalStatus}`);
  } catch (error) {
    logger.error('Resolve dispute error:', error);
    return ApiResponse.error(res, 'Failed to resolve dispute');
  }
};

const escalateDispute = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [disputes] = await pool.query('SELECT escalation_level, title FROM disputes WHERE id = ?', [id]);
    if (!disputes.length) return ApiResponse.notFound(res, 'Dispute not found');

    const levels = { ward: 'lga', lga: 'state', state: 'state' };
    const newLevel = levels[disputes[0].escalation_level] || 'state';

    await pool.query(
      "UPDATE disputes SET escalation_level = ?, status = 'escalated' WHERE id = ?",
      [newLevel, id]
    );

    const roleMap = { lga: 'lga_coordinator', state: 'state_coordinator' };
    if (roleMap[newLevel]) {
      notificationService.notifyByRole(roleMap[newLevel], 'Dispute Escalated', `Dispute "${disputes[0].title}" escalated to ${newLevel} level`, 'escalation', 'dispute', id);
    }

    return ApiResponse.success(res, null, `Dispute escalated to ${newLevel} level`);
  } catch (error) {
    logger.error('Escalate dispute error:', error);
    return ApiResponse.error(res, 'Failed to escalate dispute');
  }
};

module.exports = { raiseDispute, listDisputes, getDispute, addComment, addEvidence, resolveDispute, escalateDispute };
