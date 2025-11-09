const db = require('../database/db');

// Get all routes with pagination and search
exports.getAllRoutes = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const country_id = req.query.country_id;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        r.id,
        r.name,
        r.region,
        r.region_name,
        r.country_id,
        r.country_name,
        r.status,
        GROUP_CONCAT(DISTINCT rsr.sales_rep_id ORDER BY rsr.sales_rep_id SEPARATOR ',') as sales_rep_ids,
        GROUP_CONCAT(DISTINCT sr.name ORDER BY sr.name SEPARATOR ', ') as sales_rep_names
      FROM routes r
      LEFT JOIN route_sales_reps rsr ON r.id = rsr.route_id
      LEFT JOIN SalesRep sr ON rsr.sales_rep_id = sr.id
    `;
    
    let countQuery = `
      SELECT COUNT(DISTINCT r.id) as total 
      FROM routes r
      LEFT JOIN route_sales_reps rsr ON r.id = rsr.route_id
      LEFT JOIN SalesRep sr ON rsr.sales_rep_id = sr.id
    `;
    const params = [];
    const countParams = [];

    const whereConditions = [];
    
    if (search) {
      whereConditions.push(`(r.name LIKE ? OR r.region_name LIKE ? OR r.country_name LIKE ? OR sr.name LIKE ?)`);
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    if (country_id) {
      whereConditions.push(`r.country_id = ?`);
      params.push(country_id);
      countParams.push(country_id);
    }
    
    if (whereConditions.length > 0) {
      const whereClause = ` WHERE ${whereConditions.join(' AND ')}`;
      query += whereClause;
      countQuery += whereClause;
    }

    query += ' GROUP BY r.id ORDER BY r.name LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await db.query(query, params);
    const [countResult] = await db.query(countQuery, countParams);
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Format the response to include sales reps as arrays
    const formattedRows = rows.map(row => ({
      ...row,
      sales_rep_ids: row.sales_rep_ids ? row.sales_rep_ids.split(',').map(id => parseInt(id)) : [],
      sales_rep_names: row.sales_rep_names || '',
      // For backward compatibility, keep the old fields (use first sales rep if exists)
      sales_rep_id: row.sales_rep_ids ? parseInt(row.sales_rep_ids.split(',')[0]) : 0,
      sales_rep_name: row.sales_rep_names ? row.sales_rep_names.split(', ')[0] : ''
    }));

    res.json({
      success: true,
      data: formattedRows,
      page,
      limit,
      total,
      totalPages
    });
  } catch (err) {
    console.error('Error fetching routes:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch routes', 
      details: err.message 
    });
  }
};

// Get route by ID
exports.getRouteById = async (req, res) => {
  try {
    const { id } = req.params;
    const [routeRows] = await db.query(
      'SELECT * FROM routes WHERE id = ?', 
      [id]
    );
    
    if (routeRows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Route not found' 
      });
    }

    // Get sales reps for this route
    const [salesRepRows] = await db.query(
      `SELECT rsr.sales_rep_id, sr.name as sales_rep_name
       FROM route_sales_reps rsr
       LEFT JOIN SalesRep sr ON rsr.sales_rep_id = sr.id
       WHERE rsr.route_id = ?`,
      [id]
    );

    const route = routeRows[0];
    const salesReps = salesRepRows.map(row => ({
      id: row.sales_rep_id,
      name: row.sales_rep_name
    }));

    res.json({
      success: true,
      data: {
        ...route,
        sales_rep_ids: salesReps.map(sr => sr.id),
        sales_rep_names: salesReps.map(sr => sr.name).join(', '),
        sales_reps: salesReps,
        // For backward compatibility
        sales_rep_id: salesReps.length > 0 ? salesReps[0].id : 0,
        sales_rep_name: salesReps.length > 0 ? salesReps[0].name : ''
      }
    });
  } catch (err) {
    console.error('Error fetching route:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch route', 
      details: err.message 
    });
  }
};

// Create a new route
exports.createRoute = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { 
      name, 
      region, 
      region_name, 
      country_id, 
      country_name, 
      sales_rep_ids, // Array of sales rep IDs
      sales_rep_id, // For backward compatibility (single value)
      sales_rep_name, 
      status 
    } = req.body;

    if (!name) {
      await connection.rollback();
      return res.status(400).json({ 
        success: false,
        error: 'Route name is required' 
      });
    }

    // Determine sales rep IDs - use array if provided, otherwise use single value
    const repIds = Array.isArray(sales_rep_ids) ? sales_rep_ids : (sales_rep_id ? [sales_rep_id] : []);
    
    // Get sales rep names if IDs are provided
    let salesRepNames = '';
    let firstRepId = 0;
    let firstRepName = '';
    
    if (repIds.length > 0) {
      const placeholders = repIds.map(() => '?').join(',');
      const [salesRepRows] = await connection.query(
        `SELECT id, name FROM SalesRep WHERE id IN (${placeholders})`,
        repIds
      );
      salesRepNames = salesRepRows.map(row => row.name).join(', ');
      firstRepId = repIds[0];
      firstRepName = salesRepRows.length > 0 ? salesRepRows[0].name : '';
    }
    
    // Insert route (keep old columns for backward compatibility)
    const [result] = await connection.query(
      `INSERT INTO routes (
        name, region, region_name, country_id, country_name, 
        sales_rep_id, sales_rep_name, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, region, region_name, country_id, country_name, firstRepId, firstRepName, status || 1]
    );

    const routeId = result.insertId;

    // Insert into junction table if sales reps are provided
    if (repIds.length > 0) {
      const insertValues = repIds.map(repId => [routeId, repId]);
      await connection.query(
        'INSERT INTO route_sales_reps (route_id, sales_rep_id) VALUES ?',
        [insertValues]
      );
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      data: {
        id: routeId,
        name,
        region,
        region_name,
        country_id,
        country_name,
        sales_rep_ids: repIds,
        sales_rep_names: salesRepNames,
        sales_rep_id: firstRepId,
        sales_rep_name: firstRepName,
        status: status || 1
      }
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error creating route:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create route', 
      details: err.message 
    });
  } finally {
    connection.release();
  }
};

// Update a route
exports.updateRoute = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { 
      name, 
      region, 
      region_name, 
      country_id, 
      country_name, 
      sales_rep_ids, // Array of sales rep IDs
      sales_rep_id, // For backward compatibility (single value)
      sales_rep_name, 
      status 
    } = req.body;

    if (!name) {
      await connection.rollback();
      return res.status(400).json({ 
        success: false,
        error: 'Route name is required' 
      });
    }

    // Determine sales rep IDs - use array if provided, otherwise use single value
    const repIds = Array.isArray(sales_rep_ids) ? sales_rep_ids : (sales_rep_id ? [sales_rep_id] : []);

    // Get sales rep names if IDs are provided
    let salesRepNames = '';
    let firstRepId = 0;
    let firstRepName = '';
    
    if (repIds.length > 0) {
      const placeholders = repIds.map(() => '?').join(',');
      const [salesRepRows] = await connection.query(
        `SELECT id, name FROM SalesRep WHERE id IN (${placeholders})`,
        repIds
      );
      salesRepNames = salesRepRows.map(row => row.name).join(', ');
      firstRepId = repIds[0];
      firstRepName = salesRepRows.length > 0 ? salesRepRows[0].name : '';
    }

    // Update route (keep old columns for backward compatibility)
    const [result] = await connection.query(
      `UPDATE routes SET 
        name = ?, region = ?, region_name = ?, country_id = ?, country_name = ?, 
        sales_rep_id = ?, sales_rep_name = ?, status = ?
      WHERE id = ?`,
      [name, region, region_name, country_id, country_name, firstRepId, firstRepName, status, id]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ 
        success: false,
        error: 'Route not found' 
      });
    }

    // Update junction table - delete existing and insert new
    await connection.query('DELETE FROM route_sales_reps WHERE route_id = ?', [id]);
    
    if (repIds.length > 0) {
      const insertValues = repIds.map(repId => [id, repId]);
      await connection.query(
        'INSERT INTO route_sales_reps (route_id, sales_rep_id) VALUES ?',
        [insertValues]
      );
    }

    await connection.commit();

    res.json({
      success: true,
      data: {
        id: parseInt(id),
        name,
        region,
        region_name,
        country_id,
        country_name,
        sales_rep_ids: repIds,
        sales_rep_names: salesRepNames,
        sales_rep_id: firstRepId,
        sales_rep_name: firstRepName,
        status
      }
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error updating route:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update route', 
      details: err.message 
    });
  } finally {
    connection.release();
  }
};

// Delete a route
exports.deleteRoute = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await db.query('DELETE FROM routes WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Route not found' 
      });
    }

    res.json({
      success: true,
      message: 'Route deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting route:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete route', 
      details: err.message 
    });
  }
};
