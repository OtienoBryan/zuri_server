const db = require('../database/db');

// Get all locations with pagination and search
exports.getAllLocations = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const route_id = req.query.route_id;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        l.id,
        l.name,
        l.route_id,
        l.route_name,
        l.status,
        l.created_at,
        l.updated_at
      FROM locations l
    `;
    
    let countQuery = 'SELECT COUNT(*) as total FROM locations l';
    const params = [];
    const countParams = [];

    const whereConditions = [];
    
    if (search) {
      whereConditions.push(`(l.name LIKE ? OR l.route_name LIKE ?)`);
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
      countParams.push(searchTerm, searchTerm);
    }
    
    if (route_id) {
      whereConditions.push(`l.route_id = ?`);
      params.push(route_id);
      countParams.push(route_id);
    }
    
    if (whereConditions.length > 0) {
      const whereClause = ` WHERE ${whereConditions.join(' AND ')}`;
      query += whereClause;
      countQuery += whereClause;
    }

    query += ' ORDER BY l.name LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await db.query(query, params);
    const [countResult] = await db.query(countQuery, countParams);
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: rows,
      page,
      limit,
      total,
      totalPages
    });
  } catch (err) {
    console.error('Error fetching locations:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch locations', 
      details: err.message 
    });
  }
};

// Get location by ID
exports.getLocationById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      'SELECT * FROM locations WHERE id = ?', 
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Location not found' 
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });
  } catch (err) {
    console.error('Error fetching location:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch location', 
      details: err.message 
    });
  }
};

// Create a new location
exports.createLocation = async (req, res) => {
  try {
    const { 
      name, 
      route_id,
      status 
    } = req.body;

    if (!name) {
      return res.status(400).json({ 
        success: false,
        error: 'Location name is required' 
      });
    }

    if (!route_id) {
      return res.status(400).json({ 
        success: false,
        error: 'Route is required' 
      });
    }

    // Get route name from route_id
    const [routeRows] = await db.query('SELECT name FROM routes WHERE id = ?', [route_id]);
    if (routeRows.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid route selected' 
      });
    }
    const route_name = routeRows[0].name;

    const [result] = await db.query(
      `INSERT INTO locations (
        name, route_id, route_name, status
      ) VALUES (?, ?, ?, ?)`,
      [name, route_id, route_name, status || 1]
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        name,
        route_id,
        route_name,
        status: status || 1
      }
    });
  } catch (err) {
    console.error('Error creating location:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create location', 
      details: err.message 
    });
  }
};

// Update a location
exports.updateLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      route_id,
      status 
    } = req.body;

    if (!name) {
      return res.status(400).json({ 
        success: false,
        error: 'Location name is required' 
      });
    }

    if (!route_id) {
      return res.status(400).json({ 
        success: false,
        error: 'Route is required' 
      });
    }

    // Get route name from route_id
    const [routeRows] = await db.query('SELECT name FROM routes WHERE id = ?', [route_id]);
    if (routeRows.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid route selected' 
      });
    }
    const route_name = routeRows[0].name;

    const [result] = await db.query(
      `UPDATE locations SET 
        name = ?, route_id = ?, route_name = ?, status = ?
      WHERE id = ?`,
      [name, route_id, route_name, status, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Location not found' 
      });
    }

    res.json({
      success: true,
      data: {
        id: parseInt(id),
        name,
        route_id,
        route_name,
        status
      }
    });
  } catch (err) {
    console.error('Error updating location:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update location', 
      details: err.message 
    });
  }
};

// Delete a location
exports.deleteLocation = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await db.query('DELETE FROM locations WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Location not found' 
      });
    }

    res.json({
      success: true,
      message: 'Location deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting location:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete location', 
      details: err.message 
    });
  }
};
