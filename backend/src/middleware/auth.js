const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'gsem-development-only-secret');
if (!JWT_SECRET) throw new Error('JWT_SECRET is required in production');

// Verify JWT token
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return ApiResponse.unauthorized(res, 'Access token required');
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET, { issuer: 'gsem-api' });

    // Get user from DB
    const [users] = await pool.query(
      'SELECT id, email, phone, first_name, last_name, role, status, lga_id, ward_id, polling_unit_id, photo_url, token_version FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!users.length) {
      return ApiResponse.unauthorized(res, 'User not found');
    }

    const user = users[0];
    if (decoded.token_version !== undefined && Number(decoded.token_version) !== Number(user.token_version || 0)) {
      return ApiResponse.unauthorized(res, 'Access token has been revoked');
    }
    if (user.status !== 'active') {
      return ApiResponse.forbidden(res, 'Account is not active');
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return ApiResponse.unauthorized(res, 'Token expired');
    }
    if (error.name === 'JsonWebTokenError') {
      return ApiResponse.unauthorized(res, 'Invalid token');
    }
    logger.error('Auth middleware error:', error);
    return ApiResponse.error(res, 'Authentication failed');
  }
};

// Optional auth (for endpoints that work with or without auth)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET, { issuer: 'gsem-api' });

    const [users] = await pool.query(
      'SELECT id, email, phone, first_name, last_name, role, status, lga_id, ward_id, polling_unit_id, photo_url, token_version FROM users WHERE id = ?',
      [decoded.id]
    );

    if (users.length) {
      const user = users[0];
      if (decoded.token_version === undefined || Number(decoded.token_version) === Number(user.token_version || 0)) {
        req.user = user;
      }
    }
  } catch (error) {
    // Ignore auth errors for optional auth
  }
  next();
};

// Role-based access control
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return ApiResponse.unauthorized(res, 'Authentication required');
    }
    if (!roles.includes(req.user.role)) {
      return ApiResponse.forbidden(res, `Access denied. Required roles: ${roles.join(', ')}`);
    }
    next();
  };
};

// Jurisdiction check — ensure user can only access their assigned area
const checkJurisdiction = (level) => {
  return (req, res, next) => {
    if (!req.user) {
      return ApiResponse.unauthorized(res);
    }

    // Super admin and state coordinator can access everything
    if (['super_admin', 'state_coordinator'].includes(req.user.role)) {
      return next();
    }

    const entityId = parseInt(req.params.id || req.params.lgaId || req.params.wardId || req.body.lga_id || req.body.ward_id);

    if (level === 'lga' && req.user.role === 'lga_coordinator') {
      if (req.user.lga_id !== entityId) {
        return ApiResponse.forbidden(res, 'You can only access your assigned LGA');
      }
    }

    if (level === 'ward' && req.user.role === 'ward_officer') {
      if (req.user.ward_id !== entityId) {
        return ApiResponse.forbidden(res, 'You can only access your assigned ward');
      }
    }

    next();
  };
};

module.exports = { authenticate, optionalAuth, authorize, checkJurisdiction };
