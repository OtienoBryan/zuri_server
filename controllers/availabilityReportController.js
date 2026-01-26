const db = require('../database/db');

// Ensure asset_report table exists
async function ensureAssetReportTable() {
  try {
    // Try to query the table first - if it fails, create it
    await db.query(`SELECT 1 FROM \`asset_report\` LIMIT 1`);
    console.log('asset_report table exists');
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146) {
      console.log('asset_report table does not exist, creating it...');
      try {
        await db.query(`
          CREATE TABLE IF NOT EXISTS \`asset_report\` (
            id INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
            admin_id INT(30) NOT NULL,
            asset_id INT(11) NOT NULL,
            asset_name VARCHAR(32) NOT NULL,
            quantity VARCHAR(32) NOT NULL,
            outlet_id INT(11) NOT NULL,
            outlet VARCHAR(32) NOT NULL,
            merchandiser INT(11) NOT NULL,
            role INT(11) NOT NULL,
            region INT(11) NOT NULL,
            created_date VARCHAR(32) NOT NULL,
            month VARCHAR(32) NOT NULL,
            year VARCHAR(32) NOT NULL,
            INDEX idx_admin_id (admin_id),
            INDEX idx_asset_id (asset_id),
            INDEX idx_outlet_id (outlet_id),
            INDEX idx_merchandiser (merchandiser),
            INDEX idx_created_date (created_date),
            INDEX idx_month_year (month, year)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('asset_report table created successfully!');
      } catch (createErr) {
        console.error('Error creating asset_report table:', createErr);
        throw createErr;
      }
    } else {
      console.error('Error checking asset_report table:', err);
      throw err;
    }
  }
}

exports.getAllAvailabilityReports = async (req, res) => {
  try {
    await ensureAssetReportTable();
    console.log('Availability reports route hit!');
    const { startDate, endDate, currentDate, page = 1, limit = 10, outlet, search } = req.query;
    const isViewAll = parseInt(limit) === -1;
    const offset = isViewAll ? 0 : (parseInt(page) - 1) * parseInt(limit);
    
    // Query asset_report table with Clients and locations join
    let sql = `
      SELECT ar.id, ar.admin_id, ar.asset_id, ar.asset_name, ar.quantity, 
             ar.outlet_id, ar.outlet, ar.merchandiser, ar.role, ar.region,
             ar.created_date, ar.month, ar.year,
             COALESCE(NULLIF(c.name, ''), NULLIF(l.name, ''), NULLIF(ar.outlet, ''), 'Unknown') AS outlet_name
      FROM \`asset_report\` ar
      LEFT JOIN \`Clients\` c ON ar.outlet_id = c.id
      LEFT JOIN \`locations\` l ON ar.outlet_id = l.id
    `;
    let countSql = `
      SELECT COUNT(*) as total
      FROM \`asset_report\` ar
      LEFT JOIN \`Clients\` c ON ar.outlet_id = c.id
      LEFT JOIN \`locations\` l ON ar.outlet_id = l.id
    `;
    const params = [];
    const countParams = [];
    let whereConditions = [];
    
    // Date filtering - using created_date, month, and year fields
    // Since created_date is VARCHAR, we'll try to match it as a string
    if (currentDate) {
      // Match by created_date (as string) or by year and month
      const dateParts = currentDate.split('-');
      const year = dateParts[0] || '';
      const month = dateParts[1] || '';
      whereConditions.push(`(ar.created_date = ? OR (ar.year = ? AND ar.month = ?))`);
      params.push(currentDate, year, month);
      countParams.push(currentDate, year, month);
    } else if (startDate && endDate) {
      // Filter by date range - match created_date (as string comparison) or year range
      const startParts = startDate.split('-');
      const endParts = endDate.split('-');
      const startYear = startParts[0] || '';
      const endYear = endParts[0] || '';
      whereConditions.push(`(ar.created_date BETWEEN ? AND ? OR ar.year BETWEEN ? AND ?)`);
      params.push(startDate, endDate, startYear, endYear);
      countParams.push(startDate, endDate, startYear, endYear);
    } else if (startDate) {
      const startParts = startDate.split('-');
      const startYear = startParts[0] || '';
      whereConditions.push(`(ar.created_date >= ? OR ar.year >= ?)`);
      params.push(startDate, startYear);
      countParams.push(startDate, startYear);
    } else if (endDate) {
      const endParts = endDate.split('-');
      const endYear = endParts[0] || '';
      whereConditions.push(`(ar.created_date <= ? OR ar.year <= ?)`);
      params.push(endDate, endYear);
      countParams.push(endDate, endYear);
    }
    
    if (outlet && outlet !== 'all') {
      whereConditions.push(`(c.name LIKE ? OR l.name LIKE ? OR ar.outlet LIKE ?)`);
      params.push(`%${outlet}%`, `%${outlet}%`, `%${outlet}%`);
      countParams.push(`%${outlet}%`, `%${outlet}%`, `%${outlet}%`);
    }
    
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      whereConditions.push(`(ar.asset_name LIKE ? OR c.name LIKE ? OR l.name LIKE ? OR ar.outlet LIKE ? OR ar.quantity LIKE ?)`);
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
      countParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    if (whereConditions.length > 0) {
      const whereClause = ` WHERE ${whereConditions.join(' AND ')}`;
      sql += whereClause;
      countSql += whereClause;
    }
    sql += ` ORDER BY ar.year DESC, ar.month DESC, ar.created_date DESC, ar.id DESC`;
    if (!isViewAll) {
      sql += ` LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), offset);
    }
    const [results] = await db.query(sql, params);
    const [countResult] = await db.query(countSql, countParams);
    const total = countResult[0].total;
    
    // Debug: Log first result to see what we're getting
    if (results.length > 0) {
      console.log('Sample availability report:', {
        id: results[0].id,
        outlet_id: results[0].outlet_id,
        outlet: results[0].outlet,
        outlet_name: results[0].outlet_name
      });
    }
    
    res.json({ 
      success: true, 
      reports: results,
      total,
      page: isViewAll ? 1 : parseInt(page),
      limit: isViewAll ? total : parseInt(limit),
      totalPages: isViewAll ? 1 : Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error('Error fetching availability reports:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.exportAvailabilityReportsCSV = async (req, res) => {
  try {
    await ensureAssetReportTable();
    console.log('Availability reports CSV export route hit!');
    const { startDate, endDate, currentDate, outlet, search } = req.query;
    let sql = `
      SELECT ar.id, ar.admin_id, ar.asset_id, ar.asset_name, ar.quantity, 
             ar.outlet_id, ar.outlet, ar.merchandiser, ar.role, ar.region,
             ar.created_date, ar.month, ar.year,
             COALESCE(NULLIF(c.name, ''), NULLIF(l.name, ''), NULLIF(ar.outlet, ''), 'Unknown') AS outlet_name
      FROM \`asset_report\` ar
      LEFT JOIN \`Clients\` c ON ar.outlet_id = c.id
      LEFT JOIN \`locations\` l ON ar.outlet_id = l.id
    `;
    const params = [];
    let whereConditions = [];
    
    // Date filtering
    if (currentDate) {
      const dateParts = currentDate.split('-');
      const year = dateParts[0] || '';
      const month = dateParts[1] || '';
      whereConditions.push(`(ar.created_date = ? OR (ar.year = ? AND ar.month = ?))`);
      params.push(currentDate, year, month);
    } else if (startDate && endDate) {
      const startParts = startDate.split('-');
      const endParts = endDate.split('-');
      const startYear = startParts[0] || '';
      const endYear = endParts[0] || '';
      whereConditions.push(`(ar.created_date BETWEEN ? AND ? OR ar.year BETWEEN ? AND ?)`);
      params.push(startDate, endDate, startYear, endYear);
    } else if (startDate) {
      const startParts = startDate.split('-');
      const startYear = startParts[0] || '';
      whereConditions.push(`(ar.created_date >= ? OR ar.year >= ?)`);
      params.push(startDate, startYear);
    } else if (endDate) {
      const endParts = endDate.split('-');
      const endYear = endParts[0] || '';
      whereConditions.push(`(ar.created_date <= ? OR ar.year <= ?)`);
      params.push(endDate, endYear);
    }
    
    if (outlet && outlet !== 'all') {
      whereConditions.push(`(c.name LIKE ? OR l.name LIKE ? OR ar.outlet LIKE ?)`);
      params.push(`%${outlet}%`, `%${outlet}%`, `%${outlet}%`);
    }
    
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      whereConditions.push(`(ar.asset_name LIKE ? OR c.name LIKE ? OR l.name LIKE ? OR ar.outlet LIKE ? OR ar.quantity LIKE ?)`);
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    if (whereConditions.length > 0) {
      const whereClause = ` WHERE ${whereConditions.join(' AND ')}`;
      sql += whereClause;
    }
    sql += ` ORDER BY ar.year DESC, ar.month DESC, ar.created_date DESC, ar.id DESC`;
    const [results] = await db.query(sql, params);
    
    // Convert to CSV
    const headers = ['ID', 'Admin ID', 'Asset ID', 'Asset Name', 'Quantity', 'Outlet ID', 'Outlet Name', 'Outlet', 'Merchandiser', 'Role', 'Region', 'Created Date', 'Month', 'Year'];
    const csvRows = [headers.join(',')];
    
    results.forEach(row => {
      const values = [
        row.id || '',
        row.admin_id || '',
        row.asset_id || '',
        `"${(row.asset_name || '').replace(/"/g, '""')}"`,
        `"${(row.quantity || '').replace(/"/g, '""')}"`,
        row.outlet_id || '',
        `"${(row.outlet_name || row.outlet || '').replace(/"/g, '""')}"`,
        `"${(row.outlet || '').replace(/"/g, '""')}"`,
        row.merchandiser || '',
        row.role || '',
        row.region || '',
        `"${(row.created_date || '').replace(/"/g, '""')}"`,
        `"${(row.month || '').replace(/"/g, '""')}"`,
        `"${(row.year || '').replace(/"/g, '""')}"`
      ];
      csvRows.push(values.join(','));
    });
    
    const csv = csvRows.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=availability-reports-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (err) {
    console.error('Error exporting availability reports:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}; 