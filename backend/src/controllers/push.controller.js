const { pool } = require('../config/database');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

const subscribe = async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return ApiResponse.badRequest(res, 'Invalid push subscription');
    }
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [req.user.id, endpoint, keys.p256dh, keys.auth]
    );
    return ApiResponse.success(res, null, 'Push subscription saved');
  } catch (error) {
    logger.error('Push subscribe error:', error);
    return ApiResponse.error(res, 'Failed to subscribe');
  }
};

const unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;
    await pool.query('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', [req.user.id, endpoint]);
    return ApiResponse.success(res, null, 'Push subscription removed');
  } catch (error) {
    logger.error('Push unsubscribe error:', error);
    return ApiResponse.error(res, 'Failed to unsubscribe');
  }
};

const getVapidKey = async (req, res) => {
  return ApiResponse.success(res, { publicKey: process.env.VAPID_PUBLIC_KEY || '' });
};

module.exports = { subscribe, unsubscribe, getVapidKey };
