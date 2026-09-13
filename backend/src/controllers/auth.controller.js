const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { pool, cache } = require('../config/database');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'gsem-development-only-secret');
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (process.env.NODE_ENV === 'production' ? null : 'gsem-development-only-refresh-secret');
if (!JWT_SECRET || !JWT_REFRESH_SECRET) throw new Error('JWT_SECRET and JWT_REFRESH_SECRET are required in production');
const ACCESS_TOKEN_EXPIRY = '30m';
const REFRESH_TOKEN_EXPIRY = '7d';
const BCRYPT_ROUNDS = 12;

function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      lga_id: user.lga_id || null,
      ward_id: user.ward_id || null,
      polling_unit_id: user.polling_unit_id || null,
      token_version: Number(user.token_version || 0)
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY, issuer: 'gsem-api' }
  );
}

function generateRefreshToken(user) {
  const jti = uuidv4();
  const token = jwt.sign(
    { id: user.id, jti },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY, issuer: 'gsem-api' }
  );
  return { token, jti };
}

async function register(req, res) {
  try {
    const { email, phone, password, first_name, last_name, requested_role, lga_id, ward_id, polling_unit_id } = req.body;

    if (!password || !first_name || !last_name) {
      return ApiResponse.badRequest(res, 'first_name, last_name, and password are required');
    }

    if (!email && !phone) {
      return ApiResponse.badRequest(res, 'Either email or phone is required');
    }

    if (password.length < 8) {
      return ApiResponse.badRequest(res, 'Password must be at least 8 characters');
    }

    const finalRole = requested_role || 'pu_agent';
    const allowedRoles = new Set(['pu_agent', 'ward_officer', 'lga_coordinator', 'observer']);
    if (!allowedRoles.has(finalRole)) {
      return ApiResponse.badRequest(res, 'Invalid registration role');
    }

    // Check both approved accounts and existing pending applications. This prevents
    // duplicate submissions while keeping the review queue authoritative.
    if (email) {
      const [existingEmail] = await pool.query(
        'SELECT id FROM users WHERE email = ? LIMIT 1',
        [email]
      );
      if (existingEmail.length > 0) {
        return ApiResponse.conflict(res, 'A user with this email already exists');
      }
    }

    if (phone) {
      const [existingPhone] = await pool.query(
        'SELECT id FROM users WHERE phone = ? LIMIT 1',
        [phone]
      );
      if (existingPhone.length > 0) {
        return ApiResponse.conflict(res, 'A user with this phone number already exists');
      }
    }

    const applicationConditions = [];
    const applicationParams = [];
    if (email) { applicationConditions.push('email = ?'); applicationParams.push(email); }
    if (phone) { applicationConditions.push('phone = ?'); applicationParams.push(phone); }
    const [existingApplications] = await pool.query(
      `SELECT id FROM registration_applications WHERE status = 'pending' AND (${applicationConditions.join(' OR ')}) LIMIT 1`,
      applicationParams
    );
    if (existingApplications.length > 0) {
      return ApiResponse.conflict(res, 'A pending application already exists for this contact');
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const [insertResult] = await pool.query(
      `INSERT INTO registration_applications
        (email, phone, password_hash, first_name, last_name, requested_role, lga_id, ward_id, polling_unit_id, nin, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())
       RETURNING id`,
      [
        email || null, phone || null, hashedPassword, first_name, last_name, finalRole,
        lga_id || null, ward_id || null, polling_unit_id || null, req.body.nin || null
      ]
    );

    const applicationId = insertResult.insertId;

    await pool.query(
      `INSERT INTO audit_logs (id, action, resource_type, resource_id, new_value, ip_address, user_agent, created_at)
       VALUES (?, 'register', 'application', ?, ?, ?, ?, NOW())`,
      [uuidv4(), applicationId, JSON.stringify({ email, phone, requested_role: finalRole }), req.ip, req.get('user-agent') || null]
    );

    logger.info(`New registration application submitted: ${applicationId} (${email || phone})`);

    return ApiResponse.created(res, {
      id: applicationId,
      email: email || null,
      phone: phone || null,
      first_name,
      last_name,
      status: 'pending',
      role: finalRole
    }, 'Registration successful. Your application is pending approval.');

  } catch (error) {
    logger.error('Registration error:', error);
    return ApiResponse.error(res, 'Registration failed');
  }
}

async function login(req, res) {
  try {
    const { email, phone, password } = req.body;

    if (!password || (!email && !phone)) {
      return ApiResponse.badRequest(res, 'Email or phone and password are required');
    }

    // Find user by email or phone
    const [users] = await pool.query(
      'SELECT id, email, phone, first_name, last_name, role, status, lga_id, ward_id, polling_unit_id, profile_photo_url, email_verified, password_hash, token_version FROM users WHERE (email = ? OR phone = ?) LIMIT 1',
      [email || '', phone || '']
    );

    if (users.length === 0) {
      return ApiResponse.unauthorized(res, 'Invalid credentials');
    }

    const user = users[0];

    // Check account status
    if (user.status !== 'active') {
      const statusMessages = {
        pending: 'Your account is pending approval',
        suspended: 'Your account has been suspended. Contact an administrator.',
        inactive: 'Your account is inactive. Contact an administrator.'
      };
      return ApiResponse.forbidden(res, statusMessages[user.status] || 'Account not active');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return ApiResponse.unauthorized(res, 'Invalid credentials');
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const { token: refreshToken, jti } = generateRefreshToken(user);

    // Store refresh token in DB
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, jti, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [uuidv4(), user.id, crypto.createHash('sha256').update(refreshToken).digest('hex'), jti, expiresAt]
    );

    // Update last_login
    await pool.query(
      'UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE id = ?',
      [user.id]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, ip_address, created_at)
       VALUES (?, ?, 'login', 'user', ?, ?, NOW())`,
      [uuidv4(), user.id, user.id, req.ip]
    );

    logger.info(`User logged in: ${user.id} (${user.email || user.phone})`);

    return ApiResponse.success(res, {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        status: user.status,
        lga_id: user.lga_id,
        ward_id: user.ward_id,
        polling_unit_id: user.polling_unit_id,
        profile_photo_url: user.profile_photo_url,
        email_verified: user.email_verified,
        last_login: new Date().toISOString()
      },
      accessToken,
      refreshToken,
      expiresIn: 1800 // 30 minutes in seconds
    }, 'Login successful');

  } catch (error) {
    logger.error('Login error:', error);
    return ApiResponse.error(res, 'Login failed');
  }
}

async function refreshToken(req, res) {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return ApiResponse.badRequest(res, 'Refresh token is required');
    }

    // Verify the refresh token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    } catch (err) {
      return ApiResponse.unauthorized(res, 'Invalid or expired refresh token');
    }

    // Check if token exists in DB and is not revoked
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const [storedTokens] = await pool.query(
      'SELECT id FROM refresh_tokens WHERE jti = ? AND token_hash = ? AND revoked = 0 AND expires_at > NOW()',
      [decoded.jti, tokenHash]
    );

    if (storedTokens.length === 0) {
      // Token reuse detected — revoke all tokens for this user as a security measure
      await pool.query(
        'UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?',
        [decoded.id]
      );
      logger.warn(`Refresh token reuse detected for user: ${decoded.id}`);
      return ApiResponse.unauthorized(res, 'Token has been revoked. Please login again.');
    }

    // Get the user
    const [users] = await pool.query(
      'SELECT id, email, phone, first_name, last_name, role, status, lga_id, ward_id, polling_unit_id, profile_photo_url, email_verified, password_hash, token_version FROM users WHERE id = ? AND status = ? LIMIT 1',
      [decoded.id, 'active']
    );

    if (users.length === 0) {
      return ApiResponse.unauthorized(res, 'User not found or inactive');
    }

    const user = users[0];

    // Revoke old refresh token
    await pool.query(
      'UPDATE refresh_tokens SET revoked = 1 WHERE jti = ?',
      [decoded.jti]
    );

    // Generate new token pair
    const newAccessToken = generateAccessToken(user);
    const { token: newRefreshToken, jti: newJti } = generateRefreshToken(user);

    // Store new refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, jti, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [uuidv4(), user.id, crypto.createHash('sha256').update(newRefreshToken).digest('hex'), newJti, expiresAt]
    );

    return ApiResponse.success(res, {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 1800
    }, 'Token refreshed successfully');

  } catch (error) {
    logger.error('Token refresh error:', error);
    return ApiResponse.error(res, 'Token refresh failed');
  }
}

async function logout(req, res) {
  try {
    const userId = req.user.id;

    // Revoke all refresh tokens and invalidate all access tokens issued before logout.
    const [result] = await pool.query(
      'UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW() WHERE user_id = ? AND revoked = 0',
      [userId]
    );
    await pool.query(
      'UPDATE users SET token_version = COALESCE(token_version, 0) + 1, updated_at = NOW() WHERE id = ?',
      [userId]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, ip_address, created_at)
       VALUES (?, ?, 'logout', 'user', ?, ?, NOW())`,
      [uuidv4(), userId, userId, req.ip]
    );

    logger.info(`User logged out: ${userId} (${result.affectedRows} tokens revoked)`);

    return ApiResponse.success(res, null, 'Logged out successfully');

  } catch (error) {
    logger.error('Logout error:', error);
    return ApiResponse.error(res, 'Logout failed');
  }
}

async function forgotPassword(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return ApiResponse.badRequest(res, 'Email is required');
    }

    // Always return success to prevent email enumeration
    const [users] = await pool.query(
      'SELECT id, email, first_name FROM users WHERE email = ? AND status = ? LIMIT 1',
      [email, 'active']
    );

    if (users.length > 0) {
      const user = users[0];
      // Generate a password reset token (JWT-based, expires in 1 hour)
      const resetToken = jwt.sign(
        { id: user.id, purpose: 'password_reset' },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      // Store the reset token hash in system_config
      const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      await pool.query(
        `INSERT INTO system_config (config_key, config_value, updated_at)
         VALUES (?, ?, NOW())
         ON CONFLICT (config_key) DO UPDATE
         SET config_value = EXCLUDED.config_value, updated_at = NOW()`,
        [`password_reset_${user.id}`, JSON.stringify({
          token_hash: resetTokenHash,
          expires_at: new Date(Date.now() + 3600000).toISOString()
        })]
      );

      // In production, this would send an email. Log the reset link for development.
      const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
      logger.info(`Password reset requested for ${email}. Reset link: ${resetLink}`);

      // Audit log
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, ip_address, created_at)
         VALUES (?, ?, 'password_reset_request', 'user', ?, ?, NOW())`,
        [uuidv4(), user.id, user.id, req.ip]
      );
    }

    return ApiResponse.success(res, null, 'If an account with that email exists, a password reset link has been sent.');

  } catch (error) {
    logger.error('Forgot password error:', error);
    return ApiResponse.error(res, 'Password reset request failed');
  }
}

async function resetPassword(req, res) {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return ApiResponse.badRequest(res, 'Token and new password are required');
    }

    if (password.length < 8) {
      return ApiResponse.badRequest(res, 'Password must be at least 8 characters');
    }

    // Verify the reset token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return ApiResponse.badRequest(res, 'Invalid or expired reset token');
    }

    if (decoded.purpose !== 'password_reset') {
      return ApiResponse.badRequest(res, 'Invalid token purpose');
    }

    // Verify stored token hash
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const [configs] = await pool.query(
      'SELECT config_value FROM system_config WHERE config_key = ?',
      [`password_reset_${decoded.id}`]
    );

    if (configs.length === 0) {
      return ApiResponse.badRequest(res, 'Reset token not found or already used');
    }

    const storedData = JSON.parse(configs[0].config_value);
    if (storedData.token_hash !== tokenHash) {
      return ApiResponse.badRequest(res, 'Invalid reset token');
    }

    if (new Date(storedData.expires_at) < new Date()) {
      return ApiResponse.badRequest(res, 'Reset token has expired');
    }

    // Hash new password and update
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await pool.query(
      'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
      [hashedPassword, decoded.id]
    );

    // Remove the reset token
    await pool.query(
      'DELETE FROM system_config WHERE config_key = ?',
      [`password_reset_${decoded.id}`]
    );

    // Revoke every existing session after a credential reset.
    await pool.query(
      'UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW() WHERE user_id = ? AND revoked = 0',
      [decoded.id]
    );
    await pool.query(
      'UPDATE users SET token_version = COALESCE(token_version, 0) + 1, updated_at = NOW() WHERE id = ?',
      [decoded.id]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, ip_address, created_at)
       VALUES (?, ?, 'password_reset', 'user', ?, ?, NOW())`,
      [uuidv4(), decoded.id, decoded.id, req.ip]
    );

    logger.info(`Password reset completed for user: ${decoded.id}`);

    return ApiResponse.success(res, null, 'Password has been reset successfully. Please login with your new password.');

  } catch (error) {
    logger.error('Reset password error:', error);
    return ApiResponse.error(res, 'Password reset failed');
  }
}

async function verifyEmail(req, res) {
  try {
    const { token } = req.query;

    if (!token) {
      return ApiResponse.badRequest(res, 'Verification token is required');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return ApiResponse.badRequest(res, 'Invalid or expired verification token');
    }

    if (decoded.purpose !== 'email_verification') {
      return ApiResponse.badRequest(res, 'Invalid token purpose');
    }

    const [result] = await pool.query(
      'UPDATE users SET email_verified = 1, updated_at = NOW() WHERE id = ? AND email_verified = 0',
      [decoded.id]
    );

    if (result.affectedRows === 0) {
      return ApiResponse.badRequest(res, 'Email already verified or user not found');
    }

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, ip_address, created_at)
       VALUES (?, ?, 'email_verified', 'user', ?, ?, NOW())`,
      [uuidv4(), decoded.id, decoded.id, req.ip]
    );

    logger.info(`Email verified for user: ${decoded.id}`);

    return ApiResponse.success(res, null, 'Email verified successfully');

  } catch (error) {
    logger.error('Email verification error:', error);
    return ApiResponse.error(res, 'Email verification failed');
  }
}

async function getMe(req, res) {
  try {
    const userId = req.user.id;

    const [users] = await pool.query(
      `SELECT u.id, u.email, u.phone, u.first_name, u.last_name, u.role, u.status,
              u.lga_id, u.ward_id, u.polling_unit_id, u.profile_photo_url,
              u.email_verified, u.last_login, u.created_at,
              l.name AS lga_name, w.name AS ward_name, p.name AS polling_unit_name
       FROM users u
       LEFT JOIN lgas l ON u.lga_id = l.id
       LEFT JOIN wards w ON u.ward_id = w.id
       LEFT JOIN polling_units p ON u.polling_unit_id = p.id
       WHERE u.id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return ApiResponse.notFound(res, 'User not found');
    }

    const user = users[0];
    delete user.password_hash;

    return ApiResponse.success(res, user);

  } catch (error) {
    logger.error('Get profile error:', error);
    return ApiResponse.error(res, 'Failed to fetch profile');
  }
}

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  verifyEmail,
  getMe
};
