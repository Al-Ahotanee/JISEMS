const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

const updateProfile = async (req, res) => {
  try {
    const { first_name, last_name, phone, language } = req.body;
    const updates = [];
    const params = [];

    if (first_name) { updates.push('first_name = ?'); params.push(first_name); }
    if (last_name) { updates.push('last_name = ?'); params.push(last_name); }
    if (phone) { updates.push('phone = ?'); params.push(phone); }
    if (language) { updates.push('language = ?'); params.push(language); }

    if (!updates.length) return ApiResponse.badRequest(res, 'No fields to update');

    params.push(req.user.id);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    const [updated] = await pool.query(
      'SELECT id, email, phone, first_name, last_name, role, status, lga_id, ward_id, polling_unit_id, photo_url, language FROM users WHERE id = ?',
      [req.user.id]
    );
    return ApiResponse.success(res, updated[0], 'Profile updated');
  } catch (error) {
    logger.error('Update profile error:', error);
    return ApiResponse.error(res, 'Failed to update profile');
  }
};

const uploadPhoto = async (req, res) => {
  try {
    if (!req.file) return ApiResponse.badRequest(res, 'No photo uploaded');
    const photoUrl = `/uploads/profiles/${req.file.filename}`;
    await pool.query('UPDATE users SET photo_url = ? WHERE id = ?', [photoUrl, req.user.id]);
    return ApiResponse.success(res, { photo_url: photoUrl }, 'Photo uploaded');
  } catch (error) {
    logger.error('Upload photo error:', error);
    return ApiResponse.error(res, 'Failed to upload photo');
  }
};

const changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return ApiResponse.badRequest(res, 'Current and new password required');
    if (new_password.length < 8) return ApiResponse.badRequest(res, 'Password must be at least 8 characters');

    const [users] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const valid = await bcrypt.compare(current_password, users[0].password_hash);
    if (!valid) return ApiResponse.badRequest(res, 'Current password is incorrect');

    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash = ?, token_version = COALESCE(token_version, 0) + 1, updated_at = NOW() WHERE id = ?', [hash, req.user.id]);
    await pool.query('UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW() WHERE user_id = ? AND revoked = 0', [req.user.id]);
    return ApiResponse.success(res, null, 'Password changed successfully');
  } catch (error) {
    logger.error('Change password error:', error);
    return ApiResponse.error(res, 'Failed to change password');
  }
};

module.exports = { updateProfile, uploadPhoto, changePassword };
