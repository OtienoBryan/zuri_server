const db = require('../database/db');
const { DateTime } = require('luxon');

const cylinderLedgerController = {
  // Get all cylinder ledger entries with pagination and filtering
  getAllEntries: async (req, res) => {
    try {
      const { 
        cylinder_code_id, 
        transaction_type, 
        sales_order_id,
        from_date,
        to_date,
        page = 1, 
        limit = 50 
      } = req.query;
      
      let whereClause = 'WHERE 1=1';
      const queryParams = [];
      
      if (cylinder_code_id) {
        whereClause += ' AND cl.cylinder_code_id = ?';
        queryParams.push(cylinder_code_id);
      }
      
      if (transaction_type) {
        whereClause += ' AND cl.transaction_type = ?';
        queryParams.push(transaction_type);
      }
      
      if (sales_order_id) {
        whereClause += ' AND cl.sales_order_id = ?';
        queryParams.push(sales_order_id);
      }
      
      if (from_date) {
        whereClause += ' AND cl.transaction_date >= ?';
        queryParams.push(from_date);
      }
      
      if (to_date) {
        whereClause += ' AND cl.transaction_date <= ?';
        queryParams.push(to_date);
      }
      
      const offset = (page - 1) * limit;
      
      const [entries] = await db.query(`
        SELECT 
          cl.*,
          cc.code as cylinder_code,
          from_r.name as from_region_name,
          to_r.name as to_region_name,
          current_r.name as current_region_name
        FROM cylinder_ledger cl
        LEFT JOIN cylinder_codes cc ON cl.cylinder_code_id = cc.id
        LEFT JOIN Regions from_r ON cl.from_region_id = from_r.id
        LEFT JOIN Regions to_r ON cl.to_region_id = to_r.id
        LEFT JOIN Regions current_r ON cl.current_region_id = current_r.id
        ${whereClause}
        ORDER BY cl.transaction_date DESC, cl.id DESC
        LIMIT ? OFFSET ?
      `, [...queryParams, parseInt(limit), offset]);
      
      const [countResult] = await db.query(`
        SELECT COUNT(*) as total 
        FROM cylinder_ledger cl
        ${whereClause}
      `, queryParams);
      
      res.json({ 
        success: true, 
        data: entries,
        pagination: {
          current_page: parseInt(page),
          total_items: countResult[0].total,
          total_pages: Math.ceil(countResult[0].total / limit),
          items_per_page: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Error fetching cylinder ledger entries:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch cylinder ledger entries' });
    }
  },

  // Get cylinder movement history for a specific cylinder
  getCylinderHistory: async (req, res) => {
    try {
      const { cylinderCodeId } = req.params;
      
      const [entries] = await db.query(`
        SELECT 
          cl.*,
          cc.code as cylinder_code,
          from_r.name as from_region_name,
          to_r.name as to_region_name,
          current_r.name as current_region_name
        FROM cylinder_ledger cl
        LEFT JOIN cylinder_codes cc ON cl.cylinder_code_id = cc.id
        LEFT JOIN Regions from_r ON cl.from_region_id = from_r.id
        LEFT JOIN Regions to_r ON cl.to_region_id = to_r.id
        LEFT JOIN Regions current_r ON cl.current_region_id = current_r.id
        WHERE cl.cylinder_code_id = ?
        ORDER BY cl.transaction_date DESC, cl.id DESC
      `, [cylinderCodeId]);
      
      res.json({ success: true, data: entries });
    } catch (error) {
      console.error('Error fetching cylinder history:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch cylinder history' });
    }
  },

  // Get cylinder ledger entries for a specific sales order
  getOrderCylinderHistory: async (req, res) => {
    try {
      const { orderId } = req.params;
      
      const [entries] = await db.query(`
        SELECT 
          cl.*,
          cc.code as cylinder_code,
          from_r.name as from_region_name,
          to_r.name as to_region_name,
          current_r.name as current_region_name
        FROM cylinder_ledger cl
        LEFT JOIN cylinder_codes cc ON cl.cylinder_code_id = cc.id
        LEFT JOIN Regions from_r ON cl.from_region_id = from_r.id
        LEFT JOIN Regions to_r ON cl.to_region_id = to_r.id
        LEFT JOIN Regions current_r ON cl.current_region_id = current_r.id
        WHERE cl.sales_order_id = ?
        ORDER BY cl.transaction_date DESC, cl.id DESC
      `, [orderId]);
      
      res.json({ success: true, data: entries });
    } catch (error) {
      console.error('Error fetching order cylinder history:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch order cylinder history' });
    }
  },

  // Get cylinder statistics
  getCylinderStats: async (req, res) => {
    try {
      // Total entries
      const [totalCount] = await db.query('SELECT COUNT(*) as total FROM cylinder_ledger');
      
      // Entries by transaction type
      const [byType] = await db.query(`
        SELECT transaction_type, COUNT(*) as count
        FROM cylinder_ledger
        GROUP BY transaction_type
      `);
      
      // Entries by region
      const [byRegion] = await db.query(`
        SELECT 
          r.name as region_name,
          COUNT(*) as count
        FROM cylinder_ledger cl
        LEFT JOIN Regions r ON cl.current_region_id = r.id
        WHERE cl.current_region_id IS NOT NULL
        GROUP BY r.name
        ORDER BY count DESC
      `);
      
      // Recent activity (last 30 days)
      const [recentActivity] = await db.query(`
        SELECT COUNT(*) as count
        FROM cylinder_ledger
        WHERE transaction_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      `);
      
      // Currently assigned cylinders
      const [assignedCount] = await db.query(`
        SELECT COUNT(DISTINCT cylinder_code_id) as count
        FROM cylinder_ledger cl1
        WHERE cl1.transaction_date = (
          SELECT MAX(cl2.transaction_date)
          FROM cylinder_ledger cl2
          WHERE cl2.cylinder_code_id = cl1.cylinder_code_id
        )
        AND cl1.status_after = 'ASSIGNED'
      `);
      
      res.json({ 
        success: true, 
        data: {
          total_entries: totalCount[0].total,
          by_transaction_type: byType,
          by_region: byRegion,
          recent_activity_30_days: recentActivity[0].count,
          currently_assigned: assignedCount[0].count
        }
      });
    } catch (error) {
      console.error('Error fetching cylinder stats:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch cylinder statistics' });
    }
  },

  // Manual entry for cylinder movement (for special cases like maintenance, retirement, etc.)
  createManualEntry: async (req, res) => {
    try {
      const {
        cylinder_code_id,
        transaction_type,
        from_region_id,
        to_region_id,
        current_region_id,
        notes,
        status_before,
        status_after
      } = req.body;
      
      if (!cylinder_code_id || !transaction_type) {
        return res.status(400).json({ 
          success: false, 
          error: 'cylinder_code_id and transaction_type are required' 
        });
      }
      
      const performedBy = req.user?.id || 1;
      const performedByName = req.user?.full_name || req.user?.username || 'System';
      
      // Get current time in Nairobi timezone using Luxon
      const nairobiTime = DateTime.now().setZone('Africa/Nairobi');
      const nairobiTimestamp = nairobiTime.toFormat('yyyy-MM-dd HH:mm:ss');
      
      const [result] = await db.query(`
        INSERT INTO cylinder_ledger (
          cylinder_code_id,
          transaction_type,
          from_region_id,
          to_region_id,
          current_region_id,
          notes,
          performed_by,
          performed_by_name,
          status_before,
          status_after,
          transaction_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        cylinder_code_id,
        transaction_type,
        from_region_id || null,
        to_region_id || null,
        current_region_id || null,
        notes || null,
        performedBy,
        performedByName,
        status_before || null,
        status_after || null,
        nairobiTimestamp
      ]);
      
      // Update cylinder_codes table if current_region changed (using Nairobi timezone)
      if (current_region_id) {
        await db.query(
          'UPDATE cylinder_codes SET current_region = ?, last_assigned_date = ? WHERE id = ?',
          [current_region_id, nairobiTimestamp, cylinder_code_id]
        );
      }
      
      res.json({ 
        success: true, 
        message: 'Cylinder movement recorded successfully',
        ledger_id: result.insertId
      });
    } catch (error) {
      console.error('Error creating manual cylinder ledger entry:', error);
      res.status(500).json({ success: false, error: 'Failed to record cylinder movement' });
    }
  }
};

module.exports = cylinderLedgerController;

