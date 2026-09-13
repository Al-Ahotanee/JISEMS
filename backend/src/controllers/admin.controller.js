const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');
const notificationService = require('../services/notification.service');

const listUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, role, status, lga_id, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = [];

    if (role) { where += ' AND u.role = ?'; params.push(role); }
    if (status) { where += ' AND u.status = ?'; params.push(status); }
    if (lga_id) { where += ' AND u.lga_id = ?'; params.push(parseInt(lga_id)); }
    if (search) { where += ' AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM users u ${where}`, params);

    const [users] = await pool.query(
      `SELECT u.id, u.email, u.phone, u.first_name, u.last_name, u.role, u.status,
              u.lga_id, u.ward_id, u.polling_unit_id, u.last_login, u.created_at,
              l.name as lga_name, w.name as ward_name, pu.name as polling_unit_name
       FROM users u
       LEFT JOIN lgas l ON l.id = u.lga_id
       LEFT JOIN wards w ON w.id = u.ward_id
       LEFT JOIN polling_units pu ON pu.id = u.polling_unit_id
       ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    return ApiResponse.paginated(res, users, { page: parseInt(page), limit: parseInt(limit), total: countResult[0].total });
  } catch (error) {
    logger.error('List users error:', error);
    return ApiResponse.error(res, 'Failed to list users');
  }
};

const getUser = async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT u.*, l.name as lga_name, w.name as ward_name, pu.name as polling_unit_name
       FROM users u LEFT JOIN lgas l ON l.id = u.lga_id LEFT JOIN wards w ON w.id = u.ward_id
       LEFT JOIN polling_units pu ON pu.id = u.polling_unit_id WHERE u.id = ?`,
      [parseInt(req.params.id)]
    );
    if (!users.length) return ApiResponse.notFound(res, 'User not found');
    const user = users[0];
    delete user.password_hash;
    return ApiResponse.success(res, user);
  } catch (error) {
    logger.error('Get user error:', error);
    return ApiResponse.error(res, 'Failed to get user');
  }
};

const createUser = async (req, res) => {
  try {
    const { email, phone, password, first_name, last_name, role, lga_id, ward_id, polling_unit_id } = req.body;
    if (!password || !first_name || !last_name || !role) return ApiResponse.badRequest(res, 'Missing required fields');

    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      `INSERT INTO users (email, phone, password_hash, first_name, last_name, role, status, lga_id, ward_id, polling_unit_id, email_verified)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, TRUE)`,
      [email || null, phone || null, hash, first_name, last_name, role, lga_id || null, ward_id || null, polling_unit_id || null]
    );
    return ApiResponse.created(res, { id: result.insertId }, 'User created');
  } catch (error) {
    if (error.code === '23505' || error.code === 'ER_DUP_ENTRY') return ApiResponse.conflict(res, 'Email or phone already exists');
    logger.error('Create user error:', error);
    return ApiResponse.error(res, 'Failed to create user');
  }
};

const updateUser = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { role, status, lga_id, ward_id, polling_unit_id, first_name, last_name } = req.body;
    const updates = [];
    const params = [];

    if (role) { updates.push('role = ?'); params.push(role); }
    if (status) { updates.push('status = ?'); params.push(status); }
    if (lga_id !== undefined) { updates.push('lga_id = ?'); params.push(lga_id || null); }
    if (ward_id !== undefined) { updates.push('ward_id = ?'); params.push(ward_id || null); }
    if (polling_unit_id !== undefined) { updates.push('polling_unit_id = ?'); params.push(polling_unit_id || null); }
    if (first_name) { updates.push('first_name = ?'); params.push(first_name); }
    if (last_name) { updates.push('last_name = ?'); params.push(last_name); }

    if (!updates.length) return ApiResponse.badRequest(res, 'No fields to update');

    if (role || status || lga_id !== undefined || ward_id !== undefined || polling_unit_id !== undefined) {
      updates.push('token_version = COALESCE(token_version, 0) + 1');
      if (status && status !== 'active') {
        await pool.query('UPDATE refresh_tokens SET revoked = TRUE, revoked_at = NOW() WHERE user_id = ? AND revoked = FALSE', [id]);
      }
    }

    params.push(id);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    return ApiResponse.success(res, null, 'User updated');
  } catch (error) {
    logger.error('Update user error:', error);
    return ApiResponse.error(res, 'Failed to update user');
  }
};

const deleteUser = async (req, res) => {
  try {
    await pool.query("UPDATE users SET status = 'inactive' WHERE id = ?", [parseInt(req.params.id, 10)]);
    return ApiResponse.success(res, null, 'User deactivated');
  } catch (error) {
    logger.error('Delete user error:', error);
    return ApiResponse.error(res, 'Failed to deactivate user');
  }
};

const listApplications = async (req, res) => {
  try {
    // Keep the review queue authoritative even when a deployment predates the
    // registration_applications migration. This is idempotent and preserves the
    // original pending user record through user_id.
    await pool.query(
      `INSERT INTO registration_applications
        (email, phone, first_name, last_name, requested_role, password_hash, user_id,
         lga_id, ward_id, polling_unit_id, nin, status, created_at, updated_at)
       SELECT u.email, u.phone, u.first_name, u.last_name, u.role, u.password_hash, u.id,
              u.lga_id, u.ward_id, u.polling_unit_id, u.nin, 'pending', u.created_at, u.updated_at
       FROM users u
       WHERE u.status = 'pending'
         AND u.role <> 'super_admin'
         AND NOT EXISTS (
           SELECT 1 FROM registration_applications ra
           WHERE ra.user_id = u.id
              OR (ra.user_id IS NULL AND ra.status = 'pending'
                  AND ra.email IS NOT DISTINCT FROM u.email
                  AND ra.phone IS NOT DISTINCT FROM u.phone)
         )`
    );

    const { page = 1, limit = 20, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = [];
    if (status) { where += ' AND ra.status = ?'; params.push(status); }

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM registration_applications ra ${where}`, params);

    const [apps] = await pool.query(
      `SELECT ra.id, ra.user_id, ra.email, ra.phone, ra.first_name, ra.last_name,
              ra.requested_role, ra.lga_id, ra.ward_id, ra.polling_unit_id, ra.nin,
              ra.accreditation_doc_url, ra.status, ra.reviewed_by, ra.review_notes,
              ra.created_at, ra.updated_at,
              l.name AS lga_name, w.name AS ward_name, pu.name AS polling_unit_name
       FROM registration_applications ra
       LEFT JOIN lgas l ON l.id = ra.lga_id
       LEFT JOIN wards w ON w.id = ra.ward_id
       LEFT JOIN polling_units pu ON pu.id = ra.polling_unit_id
       ${where} ORDER BY ra.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    return ApiResponse.paginated(res, apps, { page: parseInt(page, 10), limit: parseInt(limit, 10), total: Number(countResult[0]?.total || 0) });
  } catch (error) {
    logger.error('List applications error:', error);
    return ApiResponse.error(res, 'Failed to list applications');
  }
};

const reviewApplication = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const { status, review_notes } = req.body;
  if (!Number.isInteger(id) || !['approved', 'rejected'].includes(status)) {
    return ApiResponse.badRequest(res, 'A valid application id and approved/rejected status are required');
  }

  let client;
  try {
    client = await pool.getConnection();
    await client.beginTransaction();

    const [apps] = await client.query(
      `SELECT id, user_id, email, phone, password_hash, first_name, last_name, requested_role,
              lga_id, ward_id, polling_unit_id, nin, status
       FROM registration_applications
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );
    if (!apps.length) {
      await client.rollback();
      return ApiResponse.notFound(res, 'Application not found');
    }

    const app = apps[0];
    if (app.status !== 'pending') {
      await client.rollback();
      return ApiResponse.conflict(res, `Application has already been ${app.status}`);
    }

    let userId = app.user_id || null;
    let tempPassword = null;

    if (status === 'approved') {
      if (userId) {
        await client.query(
          `UPDATE users
           SET email = ?, phone = ?, first_name = ?, last_name = ?, role = ?, status = 'active',
               lga_id = ?, ward_id = ?, polling_unit_id = ?, nin = COALESCE(?, nin),
               password_hash = COALESCE(?, password_hash), email_verified = TRUE, updated_at = NOW()
           WHERE id = ?`,
          [app.email, app.phone, app.first_name, app.last_name, app.requested_role,
            app.lga_id, app.ward_id, app.polling_unit_id, app.nin, app.password_hash, userId]
        );
      } else {
        tempPassword = `JISEMS${Date.now().toString(36)}!`;
        const hash = app.password_hash || await bcrypt.hash(tempPassword, 12);
        const [userResult] = await client.query(
          `INSERT INTO users
            (email, phone, password_hash, first_name, last_name, role, status,
             lga_id, ward_id, polling_unit_id, nin, email_verified, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, TRUE, NOW(), NOW())
           RETURNING id`,
          [app.email, app.phone, hash, app.first_name, app.last_name, app.requested_role,
            app.lga_id, app.ward_id, app.polling_unit_id, app.nin || null]
        );
        userId = userResult.insertId;
      }
    } else if (userId) {
      // Legacy registrations created a pending user before the application-table fix.
      // Keep the account disabled when the administrator rejects the application.
      await client.query('UPDATE users SET status = \'inactive\', updated_at = NOW() WHERE id = ?', [userId]);
    }

    await client.query(
      `UPDATE registration_applications
       SET status = ?, user_id = COALESCE(user_id, ?), reviewed_by = ?, review_notes = ?, updated_at = NOW()
       WHERE id = ?`,
      [status, userId, req.user.id, review_notes || null, id]
    );

    await client.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, new_value, ip_address, user_agent, created_at)
       VALUES (?, ?, 'review', 'application', ?, ?, ?, ?, NOW())`,
      [uuidv4(), req.user.id, id, JSON.stringify({ status, user_id: userId, review_notes: review_notes || null }), req.ip, req.get('user-agent') || null]
    );

    await client.commit();

    if (app.email) {
      if (status === 'approved') {
        notificationService.sendEmail(app.email, 'Application Approved',
          `<h3>Welcome to JISEMS!</h3><p>Your application has been approved.</p>${tempPassword ? `<p>Your temporary password is: <strong>${tempPassword}</strong></p><p>Please change it after login.</p>` : ''}`);
      } else {
        notificationService.sendEmail(app.email, 'Application Status Update',
          `<p>Your JISEMS application has been rejected.</p>${review_notes ? `<p>Notes: ${review_notes}</p>` : ''}`);
      }
    }

    return ApiResponse.success(
      res,
      { userId, tempPassword },
      status === 'approved' ? 'Application approved and account activated' : 'Application rejected'
    );
  } catch (error) {
    if (client) await client.rollback().catch(() => undefined);
    if (error.code === '23505' || error.code === 'ER_DUP_ENTRY') return ApiResponse.conflict(res, 'User with this email/phone already exists');
    logger.error('Review application error:', error);
    return ApiResponse.error(res, 'Failed to review application');
  } finally {
    if (client) client.release();
  }
};

const listAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, user_id, action, resource_type, start_date, end_date } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = [];

    if (user_id) { where += ' AND al.user_id = ?'; params.push(parseInt(user_id)); }
    if (action) { where += ' AND al.action = ?'; params.push(action); }
    if (resource_type) { where += ' AND al.resource_type = ?'; params.push(resource_type); }
    if (start_date) { where += ' AND al.created_at >= ?'; params.push(start_date); }
    if (end_date) { where += ' AND al.created_at <= ?'; params.push(end_date); }

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM audit_logs al ${where}`, params);

    const [logs] = await pool.query(
      `SELECT al.*, CONCAT(u.first_name, ' ', u.last_name) as user_name, u.email as user_email
       FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id
       ${where} ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    return ApiResponse.paginated(res, logs, { page: parseInt(page), limit: parseInt(limit), total: Number(countResult[0]?.total || 0) });
  } catch (error) {
    logger.error('List audit logs error:', error);
    return ApiResponse.error(res, 'Failed to list audit logs');
  }
};

const getSystemConfig = async (req, res) => {
  try {
    const [configs] = await pool.query('SELECT config_key, config_value, description, updated_at FROM system_config ORDER BY config_key');
    return ApiResponse.success(res, configs);
  } catch (error) {
    logger.error('Get config error:', error);
    return ApiResponse.error(res, 'Failed to get config');
  }
};

const updateSystemConfig = async (req, res) => {
  try {
    const { config_key, config_value } = req.body;
    if (!config_key) return ApiResponse.badRequest(res, 'Config key is required');

    await pool.query(
      `INSERT INTO system_config (config_key, config_value, updated_by)
       VALUES (?, ?, ?)
       ON CONFLICT (config_key) DO UPDATE
       SET config_value = EXCLUDED.config_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING id`,
      [config_key, config_value, req.user.id]
    );
    return ApiResponse.success(res, null, 'Config updated');
  } catch (error) {
    logger.error('Update config error:', error);
    return ApiResponse.error(res, 'Failed to update config');
  }
};

const getDashboardStats = async (req, res) => {
  try {
    // Keep the dashboard badge consistent with the review queue on databases
    // that contain legacy pending users created before registration_applications.
    await pool.query(
      `INSERT INTO registration_applications
        (email, phone, first_name, last_name, requested_role, password_hash, user_id,
         lga_id, ward_id, polling_unit_id, nin, status, created_at, updated_at)
       SELECT u.email, u.phone, u.first_name, u.last_name, u.role, u.password_hash, u.id,
              u.lga_id, u.ward_id, u.polling_unit_id, u.nin, 'pending', u.created_at, u.updated_at
       FROM users u
       WHERE u.status = 'pending'
         AND u.role <> 'super_admin'
         AND NOT EXISTS (
           SELECT 1 FROM registration_applications ra
           WHERE ra.user_id = u.id
              OR (ra.user_id IS NULL AND ra.status = 'pending'
                  AND ra.email IS NOT DISTINCT FROM u.email
                  AND ra.phone IS NOT DISTINCT FROM u.phone)
         )`
    );

    const [usersByRole] = await pool.query(
      'SELECT role, COUNT(*)::INTEGER as count FROM users GROUP BY role'
    );
    const [totalSubmissions] = await pool.query('SELECT COUNT(*)::INTEGER as count FROM result_submissions');
    const [pendingReviews] = await pool.query("SELECT COUNT(*)::INTEGER as count FROM result_submissions WHERE status = 'pending'");
    const [activeDisputes] = await pool.query("SELECT COUNT(*)::INTEGER as count FROM disputes WHERE status IN ('open','investigating','escalated')");
    const [pendingApps] = await pool.query("SELECT COUNT(*)::INTEGER as count FROM registration_applications WHERE status = 'pending'");

    return ApiResponse.success(res, {
      users_by_role: usersByRole.map((row) => ({ ...row, count: Number(row.count) })),
      total_submissions: Number(totalSubmissions[0]?.count || 0),
      pending_reviews: Number(pendingReviews[0]?.count || 0),
      active_disputes: Number(activeDisputes[0]?.count || 0),
      pending_applications: Number(pendingApps[0]?.count || 0)
    });
  } catch (error) {
    logger.error('Admin stats error:', error);
    return ApiResponse.error(res, 'Failed to get admin stats');
  }
};

module.exports = { listUsers, getUser, createUser, updateUser, deleteUser, listApplications, reviewApplication, listAuditLogs, getSystemConfig, updateSystemConfig, getDashboardStats };
