const db = require('../database/db');

// Ensure feedback_report table exists
async function ensureFeedbackReportTable() {
  try {
    // Try to query the table first - if it fails, create it
    await db.query(`SELECT 1 FROM \`feedback_report\` LIMIT 1`);
    console.log('feedback_report table exists');
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146) {
      console.log('feedback_report table does not exist, creating it...');
      try {
        await db.query(`
          CREATE TABLE \`feedback_report\` (
            id INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
            appoint_id INT(11) NOT NULL,
            user_id INT(11) NOT NULL,
            name VARCHAR(100) NOT NULL,
            contact VARCHAR(50) NOT NULL,
            comment TEXT NOT NULL,
            date VARCHAR(50) NOT NULL,
            INDEX idx_appoint_id (appoint_id),
            INDEX idx_user_id (user_id),
            INDEX idx_date (date)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('feedback_report table created successfully!');
      } catch (createErr) {
        console.error('Error creating feedback_report table:', createErr);
        throw createErr;
      }
    } else {
      console.error('Error checking feedback_report table:', err);
      throw err;
    }
  }
}

exports.getAllFeedbackReports = async (req, res) => {
  try {
    await ensureFeedbackReportTable();
    console.log('Feedback reports route hit!');
    const { startDate, endDate, currentDate, page = 1, limit = 10, country, salesRep, search } = req.query;
    const isViewAll = parseInt(limit) === -1;
    const offset = isViewAll ? 0 : (parseInt(page) - 1) * parseInt(limit);
    // Query feedback_report table with sales rep join only
    let sql = `
      SELECT fr.id, fr.appoint_id, fr.user_id, fr.name, fr.contact, fr.comment, fr.date,
             u.name AS salesRep
      FROM \`feedback_report\` fr
      LEFT JOIN SalesRep u ON fr.user_id = u.id
    `;
    let countSql = `
      SELECT COUNT(*) as total
      FROM \`feedback_report\` fr
    `;
    const params = [];
    const countParams = [];
    let whereConditions = [];
    if (currentDate) {
      whereConditions.push(`DATE(fr.date) = ?`);
      params.push(currentDate);
      countParams.push(currentDate);
    } else if (startDate && endDate) {
      whereConditions.push(`DATE(fr.date) BETWEEN ? AND ?`);
      params.push(startDate, endDate);
      countParams.push(startDate, endDate);
    } else if (startDate) {
      whereConditions.push(`DATE(fr.date) >= ?`);
      params.push(startDate);
      countParams.push(startDate);
    } else if (endDate) {
      whereConditions.push(`DATE(fr.date) <= ?`);
      params.push(endDate);
      countParams.push(endDate);
    }
    if (salesRep && salesRep !== 'all') {
      whereConditions.push(`u.name = ?`);
      params.push(salesRep);
      countParams.push(salesRep);
    }
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      whereConditions.push(`(u.name LIKE ? OR fr.comment LIKE ? OR fr.name LIKE ? OR fr.contact LIKE ?)`);
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    if (whereConditions.length > 0) {
      const whereClause = ` WHERE ${whereConditions.join(' AND ')}`;
      sql += whereClause;
      countSql += whereClause;
    }
    sql += ` ORDER BY fr.date DESC, fr.id DESC`;
    if (!isViewAll) {
      sql += ` LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), offset);
    }
    const [results] = await db.query(sql, params);
    const [countResult] = await db.query(countSql, countParams);
    const total = countResult[0].total;
    res.json({ 
      success: true, 
      data: results,
      pagination: {
        page: isViewAll ? 1 : parseInt(page),
        limit: isViewAll ? total : parseInt(limit),
        total,
        totalPages: isViewAll ? 1 : Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Error fetching feedback reports:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.exportFeedbackReportsCSV = async (req, res) => {
  try {
    await ensureFeedbackReportTable();
    console.log('Feedback reports CSV export route hit!');
    const { startDate, endDate, currentDate, country, salesRep, search } = req.query;
    
    // Query feedback_report table with sales rep join only
    let sql = `
      SELECT fr.id, fr.appoint_id, fr.user_id, fr.name, fr.contact, fr.comment, fr.date,
             u.name AS salesRep
      FROM \`feedback_report\` fr
      LEFT JOIN SalesRep u ON fr.user_id = u.id
    `;
    
    const params = [];
    let whereConditions = [];
    if (currentDate) {
      whereConditions.push(`DATE(fr.date) = ?`);
      params.push(currentDate);
    } else if (startDate && endDate) {
      whereConditions.push(`DATE(fr.date) BETWEEN ? AND ?`);
      params.push(startDate, endDate);
    } else if (startDate) {
      whereConditions.push(`DATE(fr.date) >= ?`);
      params.push(startDate);
    } else if (endDate) {
      whereConditions.push(`DATE(fr.date) <= ?`);
      params.push(endDate);
    }
    if (salesRep && salesRep !== 'all') {
      whereConditions.push(`u.name = ?`);
      params.push(salesRep);
    }
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      whereConditions.push(`(u.name LIKE ? OR fr.comment LIKE ? OR fr.name LIKE ? OR fr.contact LIKE ?)`);
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    if (whereConditions.length > 0) {
      const whereClause = ` WHERE ${whereConditions.join(' AND ')}`;
      sql += whereClause;
    }
    sql += ` ORDER BY fr.date DESC, fr.id DESC`;
    const [results] = await db.query(sql, params);
    
    // Convert to CSV
    const headers = ['ID', 'Appointment ID', 'User ID', 'Name', 'Contact', 'Comment', 'Date', 'Sales Rep'];
    const csvRows = [headers.join(',')];
    
    results.forEach(row => {
      const values = [
        row.id || '',
        row.appoint_id || '',
        row.user_id || '',
        `"${(row.name || '').replace(/"/g, '""')}"`,
        `"${(row.contact || '').replace(/"/g, '""')}"`,
        `"${(row.comment || '').replace(/"/g, '""')}"`,
        row.date || '',
        `"${(row.salesRep || '').replace(/"/g, '""')}"`
      ];
      csvRows.push(values.join(','));
    });
    
    const csv = csvRows.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=feedback-reports-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (err) {
    console.error('Error exporting feedback reports:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Countries endpoint removed - no longer needed
exports.getFeedbackCountries = async (req, res) => {
  res.json({ success: true, data: [] });
};

exports.getFeedbackSalesReps = async (req, res) => {
  try {
    await ensureFeedbackReportTable();
    console.log('Feedback sales reps route hit!');
    
    const sql = `
      SELECT DISTINCT u.id, u.name
      FROM SalesRep u
      INNER JOIN \`feedback_report\` fr ON fr.user_id = u.id
      WHERE u.status = 1
      ORDER BY u.name ASC
    `;
    
    const [results] = await db.query(sql);
    res.json({ success: true, data: results });
  } catch (err) {
    console.error('Error fetching feedback sales reps:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}; 