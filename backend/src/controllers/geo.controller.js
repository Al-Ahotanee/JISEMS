const { pool, cache } = require('../config/database');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

async function getLGAs(req, res) {
  try {
    const cacheKey = 'geo:lgas';
    const cached = cache.get(cacheKey);
    if (cached) {
      return ApiResponse.success(res, cached);
    }

    const [lgas] = await pool.query(`
      SELECT 
        l.id, l.name, l.code, l.headquarters, l.latitude, l.longitude, l.created_at,
        COUNT(DISTINCT w.id) AS ward_count,
        COUNT(DISTINCT p.id) AS polling_unit_count
      FROM lgas l
      LEFT JOIN wards w ON w.lga_id = l.id
      LEFT JOIN polling_units p ON p.lga_id = l.id
      GROUP BY l.id, l.name, l.code, l.headquarters, l.latitude, l.longitude, l.created_at
      ORDER BY l.name ASC
    `);

    cache.set(cacheKey, lgas, 300); // 5 minutes
    return ApiResponse.success(res, lgas);

  } catch (error) {
    logger.error('Get LGAs error:', error);
    return ApiResponse.error(res, 'Failed to fetch LGAs');
  }
}

async function getWards(req, res) {
  try {
    const { lga_id } = req.query;

    const cacheKey = `geo:wards:${lga_id || 'all'}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return ApiResponse.success(res, cached);
    }

    let query = `
      SELECT 
        w.id, w.name, w.code, w.lga_id,
        l.name AS lga_name,
        COUNT(DISTINCT p.id) AS polling_unit_count
      FROM wards w
      JOIN lgas l ON w.lga_id = l.id
      LEFT JOIN polling_units p ON p.ward_id = w.id
    `;
    const params = [];

    if (lga_id) {
      query += ' WHERE w.lga_id = ?';
      params.push(lga_id);
    }

    query += ' GROUP BY w.id, w.name, w.code, w.lga_id, l.name ORDER BY l.name ASC, w.name ASC';

    const [wards] = await pool.query(query, params);

    cache.set(cacheKey, wards, 300);
    return ApiResponse.success(res, wards);

  } catch (error) {
    logger.error('Get wards error:', error);
    return ApiResponse.error(res, 'Failed to fetch wards');
  }
}

async function getPollingUnits(req, res) {
  try {
    const { ward_id, lga_id, search, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    let countQuery = `
      SELECT COUNT(*) AS total
      FROM polling_units p
      JOIN wards w ON p.ward_id = w.id
      JOIN lgas l ON w.lga_id = l.id
    `;

    let dataQuery = `
      SELECT 
        p.id, p.name, p.code, p.ward_id, p.registered_voters,
        p.latitude, p.longitude, p.created_at,
        w.name AS ward_name, w.code AS ward_code,
        l.id AS lga_id, l.name AS lga_name, l.code AS lga_code
      FROM polling_units p
      JOIN wards w ON p.ward_id = w.id
      JOIN lgas l ON p.lga_id = l.id
    `;

    const conditions = [];
    const params = [];

    if (ward_id) {
      conditions.push('p.ward_id = ?');
      params.push(ward_id);
    }

    if (lga_id) {
      conditions.push('l.id = ?');
      params.push(lga_id);
    }

    if (search) {
      conditions.push('(p.name LIKE ? OR p.code LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (conditions.length > 0) {
      const where = ' WHERE ' + conditions.join(' AND ');
      countQuery += where;
      dataQuery += where;
    }

    dataQuery += ' ORDER BY l.name ASC, w.name ASC, p.name ASC LIMIT ? OFFSET ?';

    const countParams = [...params];
    params.push(limitNum, offset);

    const [[{ total }]] = await pool.query(countQuery, countParams);
    const [pollingUnits] = await pool.query(dataQuery, params);

    return ApiResponse.paginated(res, pollingUnits, {
      page: pageNum,
      limit: limitNum,
      total
    });

  } catch (error) {
    logger.error('Get polling units error:', error);
    return ApiResponse.error(res, 'Failed to fetch polling units');
  }
}

async function getPollingUnit(req, res) {
  try {
    const { id } = req.params;

    const [units] = await pool.query(`
      SELECT 
        p.id, p.name, p.code, p.ward_id, p.registered_voters,
        p.latitude, p.longitude, p.created_at,
        w.name AS ward_name, w.code AS ward_code,
        l.id AS lga_id, l.name AS lga_name, l.code AS lga_code
      FROM polling_units p
      JOIN wards w ON p.ward_id = w.id
      JOIN lgas l ON p.lga_id = l.id
      WHERE p.id = ?
    `, [id]);

    if (units.length === 0) {
      return ApiResponse.notFound(res, 'Polling unit not found');
    }

    const pollingUnit = units[0];

    // Get any assigned agents for this PU
    const [agents] = await pool.query(`
      SELECT id, first_name, last_name, phone, email, role
      FROM users
      WHERE polling_unit_id = ? AND status = 'active'
    `, [id]);

    pollingUnit.assigned_agents = agents;

    return ApiResponse.success(res, pollingUnit);

  } catch (error) {
    logger.error('Get polling unit error:', error);
    return ApiResponse.error(res, 'Failed to fetch polling unit');
  }
}

async function createLGA(req, res) {
  try {
    const { name, code, headquarters, latitude, longitude } = req.body;
    const [result] = await pool.query(
      `INSERT INTO lgas (name, code, headquarters, latitude, longitude) VALUES (?, ?, ?, ?, ?)`,
      [name, code, headquarters, latitude, longitude]
    );
    cache.del('geo:lgas');
    return ApiResponse.created(res, { id: result.insertId }, 'LGA created successfully');
  } catch (error) {
    logger.error('Create LGA error:', error);
    return ApiResponse.error(res, 'Failed to create LGA');
  }
}

async function updateLGA(req, res) {
  try {
    const { name, code, headquarters, latitude, longitude } = req.body;
    await pool.query(
      `UPDATE lgas SET name=?, code=?, headquarters=?, latitude=?, longitude=? WHERE id=?`,
      [name, code, headquarters, latitude, longitude, req.params.id]
    );
    cache.del('geo:lgas');
    return ApiResponse.success(res, null, 'LGA updated successfully');
  } catch (error) {
    logger.error('Update LGA error:', error);
    return ApiResponse.error(res, 'Failed to update LGA');
  }
}

async function deleteLGA(req, res) {
  try {
    await pool.query(`DELETE FROM lgas WHERE id=?`, [req.params.id]);
    cache.del('geo:lgas');
    return ApiResponse.success(res, null, 'LGA deleted successfully');
  } catch (error) {
    logger.error('Delete LGA error:', error);
    return ApiResponse.error(res, 'Failed to delete LGA');
  }
}

async function createWard(req, res) {
  try {
    const { lga_id, name, code, latitude, longitude } = req.body;
    const [result] = await pool.query(
      `INSERT INTO wards (lga_id, name, code, latitude, longitude) VALUES (?, ?, ?, ?, ?)`,
      [lga_id, name, code, latitude, longitude]
    );
    cache.flushAll(); // Flushes all ward caches
    return ApiResponse.created(res, { id: result.insertId }, 'Ward created successfully');
  } catch (error) {
    logger.error('Create Ward error:', error);
    return ApiResponse.error(res, 'Failed to create Ward');
  }
}

async function updateWard(req, res) {
  try {
    const { lga_id, name, code, latitude, longitude } = req.body;
    await pool.query(
      `UPDATE wards SET lga_id=?, name=?, code=?, latitude=?, longitude=? WHERE id=?`,
      [lga_id, name, code, latitude, longitude, req.params.id]
    );
    cache.flushAll();
    return ApiResponse.success(res, null, 'Ward updated successfully');
  } catch (error) {
    logger.error('Update Ward error:', error);
    return ApiResponse.error(res, 'Failed to update Ward');
  }
}

async function deleteWard(req, res) {
  try {
    await pool.query(`DELETE FROM wards WHERE id=?`, [req.params.id]);
    cache.flushAll();
    return ApiResponse.success(res, null, 'Ward deleted successfully');
  } catch (error) {
    logger.error('Delete Ward error:', error);
    return ApiResponse.error(res, 'Failed to delete Ward');
  }
}

async function createPollingUnit(req, res) {
  try {
    const { lga_id, ward_id, name, code, registered_voters, latitude, longitude } = req.body;
    const [result] = await pool.query(
      `INSERT INTO polling_units (lga_id, ward_id, name, code, registered_voters, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [lga_id, ward_id, name, code, registered_voters || 0, latitude, longitude]
    );
    cache.flushAll();
    return ApiResponse.created(res, { id: result.insertId }, 'Polling Unit created successfully');
  } catch (error) {
    logger.error('Create Polling Unit error:', error);
    return ApiResponse.error(res, 'Failed to create Polling Unit');
  }
}

async function updatePollingUnit(req, res) {
  try {
    const { lga_id, ward_id, name, code, registered_voters, latitude, longitude } = req.body;
    await pool.query(
      `UPDATE polling_units SET lga_id=?, ward_id=?, name=?, code=?, registered_voters=?, latitude=?, longitude=? WHERE id=?`,
      [lga_id, ward_id, name, code, registered_voters || 0, latitude, longitude, req.params.id]
    );
    cache.flushAll();
    return ApiResponse.success(res, null, 'Polling Unit updated successfully');
  } catch (error) {
    logger.error('Update Polling Unit error:', error);
    return ApiResponse.error(res, 'Failed to update Polling Unit');
  }
}

async function deletePollingUnit(req, res) {
  try {
    await pool.query(`DELETE FROM polling_units WHERE id=?`, [req.params.id]);
    cache.flushAll();
    return ApiResponse.success(res, null, 'Polling Unit deleted successfully');
  } catch (error) {
    logger.error('Delete Polling Unit error:', error);
    return ApiResponse.error(res, 'Failed to delete Polling Unit');
  }
}

module.exports = {
  getLGAs, getWards, getPollingUnits, getPollingUnit,
  createLGA, updateLGA, deleteLGA,
  createWard, updateWard, deleteWard,
  createPollingUnit, updatePollingUnit, deletePollingUnit
};
