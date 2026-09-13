const { pool } = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

function sanitizeAuditPayload(data) {
  if (!data || typeof data !== 'object') return data;
  const sensitiveKeys = new Set(['password', 'new_password', 'current_password', 'pin', 'token', 'refreshToken']);
  const sanitized = Array.isArray(data) ? [...data] : { ...data };
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.has(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeAuditPayload(sanitized[key]);
    }
  }
  return sanitized;
}

const auditLog = (action, resourceType) => {
  return async (req, res, next) => {
    // Store original json method to capture response
    const originalJson = res.json.bind(res);
    
    res.json = function(data) {
      // Only log successful mutations
      if (res.statusCode < 400) {
        const logEntry = {
          id: uuidv4(),
          user_id: req.user ? req.user.id : null,
          action: action,
          resource_type: resourceType,
          resource_id: req.params.id || (data && data.data && data.data.id) || null,
          old_value: req._auditOldValue ? JSON.stringify(sanitizeAuditPayload(req._auditOldValue)) : null,
          new_value: req.body ? JSON.stringify(sanitizeAuditPayload(req.body)) : null,
          ip_address: req.ip || req.connection.remoteAddress,
          user_agent: req.get('User-Agent') || 'unknown'
        };

        pool.query(
          `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, old_value, new_value, ip_address, user_agent) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [logEntry.id, logEntry.user_id, logEntry.action, logEntry.resource_type, logEntry.resource_id,
           logEntry.old_value, logEntry.new_value, logEntry.ip_address, logEntry.user_agent]
        ).catch(err => logger.error('Audit log error:', err));
      }

      return originalJson(data);
    };

    next();
  };
};

// Direct audit log insertion (for use in controllers)
const createAuditEntry = async (userId, action, resourceType, resourceId, oldValue, newValue, ipAddress, userAgent) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, old_value, new_value, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), userId, action, resourceType, resourceId, 
       oldValue ? JSON.stringify(sanitizeAuditPayload(oldValue)) : null,
       newValue ? JSON.stringify(sanitizeAuditPayload(newValue)) : null,
       ipAddress, userAgent]
    );
  } catch (error) {
    logger.error('Failed to create audit entry:', error);
  }
};

module.exports = { auditLog, createAuditEntry };
