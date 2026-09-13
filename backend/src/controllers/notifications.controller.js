const { pool } = require('../config/database');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

const listNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM notifications WHERE user_id = ?', [req.user.id]
    );

    const [notifications] = await pool.query(
      `SELECT id, user_id, title, message, type, is_read, reference_type, reference_id, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [req.user.id, parseInt(limit), offset]
    );

    return ApiResponse.paginated(res, notifications, {
      page: parseInt(page), limit: parseInt(limit), total: countResult[0].total
    });
  } catch (error) {
    logger.error('List notifications error:', error);
    return ApiResponse.error(res, 'Failed to list notifications');
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const [result] = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE', [req.user.id]
    );
    return ApiResponse.success(res, { count: result[0].count });
  } catch (error) {
    logger.error('Unread count error:', error);
    return ApiResponse.error(res, 'Failed to get unread count');
  }
};

const markAsRead = async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [parseInt(req.params.id), req.user.id]);
    return ApiResponse.success(res, null, 'Notification marked as read');
  } catch (error) {
    logger.error('Mark read error:', error);
    return ApiResponse.error(res, 'Failed to mark notification');
  }
};

const markAllAsRead = async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE', [req.user.id]);
    return ApiResponse.success(res, null, 'All notifications marked as read');
  } catch (error) {
    logger.error('Mark all read error:', error);
    return ApiResponse.error(res, 'Failed to mark notifications');
  }
};

const getPreferences = async (req, res) => {
  try {
    const [prefs] = await pool.query('SELECT id, user_id, notification_type, email_enabled, sms_enabled, push_enabled FROM notification_preferences WHERE user_id = ?', [req.user.id]);
    return ApiResponse.success(res, prefs);
  } catch (error) {
    logger.error('Get preferences error:', error);
    return ApiResponse.error(res, 'Failed to get preferences');
  }
};

const updatePreferences = async (req, res) => {
  try {
    const { preferences } = req.body;
    if (!Array.isArray(preferences)) return ApiResponse.badRequest(res, 'Preferences must be an array');

    for (const pref of preferences) {
      await pool.query(
        `INSERT INTO notification_preferences (user_id, notification_type, email_enabled, sms_enabled, push_enabled, in_app_enabled)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, notification_type) DO UPDATE
         SET email_enabled = EXCLUDED.email_enabled, sms_enabled = EXCLUDED.sms_enabled,
             push_enabled = EXCLUDED.push_enabled, in_app_enabled = EXCLUDED.in_app_enabled`,
        [req.user.id, pref.notification_type, pref.email_enabled, pref.sms_enabled, pref.push_enabled, pref.in_app_enabled]
      );
    }
    return ApiResponse.success(res, null, 'Preferences updated');
  } catch (error) {
    logger.error('Update preferences error:', error);
    return ApiResponse.error(res, 'Failed to update preferences');
  }
};

module.exports = { listNotifications, getUnreadCount, markAsRead, markAllAsRead, getPreferences, updatePreferences };
