const { pool } = require('../config/database');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

const exportMyData = async (req, res) => {
  try {
    const userId = req.user.id;

    const [user] = await pool.query('SELECT id, email, phone, first_name, last_name, role, lga_id, ward_id, polling_unit_id, created_at, last_login FROM users WHERE id = ?', [userId]);

    const [submissions] = await pool.query('SELECT id, submission_uid, election_id, polling_unit_id, accredited_voters, total_valid_votes, rejected_votes, total_votes_cast, status, created_at FROM result_submissions WHERE submitted_by = ?', [userId]);
    const [disputes] = await pool.query('SELECT id, title, description, category, priority, status, escalation_level, resolution_notes, created_at, resolved_at FROM disputes WHERE raised_by = ?', [userId]);
    const [notifications] = await pool.query('SELECT id, title, message, type, is_read, created_at FROM notifications WHERE user_id = ?', [userId]);
    const [auditLogs] = await pool.query('SELECT id, action, resource_type, resource_id, details, ip_address, created_at FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1000', [userId]);

    const data = {
      exported_at: new Date().toISOString(),
      user: user[0],
      result_submissions: submissions,
      disputes_raised: disputes,
      notifications,
      audit_logs: auditLogs
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=gsem-mydata-${userId}-${Date.now()}.json`);
    return res.json(data);
  } catch (error) {
    logger.error('Export data error:', error);
    return ApiResponse.error(res, 'Failed to export data');
  }
};

const requestErasure = async (req, res) => {
  try {
    const userId = req.user.id;

    await pool.query(
      `UPDATE users SET first_name = 'REDACTED', last_name = 'REDACTED', email = NULL, phone = NULL,
       nin = NULL, photo_url = NULL, status = 'inactive' WHERE id = ?`,
      [userId]
    );

    await pool.query('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
    await pool.query('DELETE FROM push_subscriptions WHERE user_id = ?', [userId]);
    await pool.query('DELETE FROM notification_preferences WHERE user_id = ?', [userId]);

    return ApiResponse.success(res, null, 'Your data has been anonymized. Account deactivated.');
  } catch (error) {
    logger.error('Erasure error:', error);
    return ApiResponse.error(res, 'Failed to process erasure request');
  }
};

module.exports = { exportMyData, requestErasure };
