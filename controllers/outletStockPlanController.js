const db = require('../database/db');

const outletStockPlanController = {
  // Get all outlet stock plans
  getAllOutletStockPlans: async (req, res) => {
    try {
      const { startDate, endDate, clientId, userId, productId } = req.query;
      
      let query = `
        SELECT 
          osp.id,
          osp.date,
          osp.time,
          osp.userId,
          osp.clientId,
          osp.product_id,
          osp.product_name,
          COALESCE(NULLIF(l.name, ''), osp.client_name, 'Unknown') as client_name,
          osp.opening_stock,
          osp.closing_stock,
          sr.name as user_name
        FROM outlet_stock_plan osp
        LEFT JOIN SalesRep sr ON osp.userId = sr.id
        LEFT JOIN locations l ON osp.clientId = l.id
        WHERE 1=1
      `;
      
      const params = [];
      
      // Date filtering
      if (startDate && endDate) {
        query += ' AND DATE(osp.date) BETWEEN ? AND ?';
        params.push(startDate, endDate);
      } else if (startDate) {
        query += ' AND DATE(osp.date) >= ?';
        params.push(startDate);
      } else if (endDate) {
        query += ' AND DATE(osp.date) <= ?';
        params.push(endDate);
      } else {
        // Default to current date if no date filter provided
        const today = new Date().toISOString().slice(0, 10);
        query += ' AND DATE(osp.date) = ?';
        params.push(today);
      }
      
      // Client filter
      if (clientId) {
        query += ' AND osp.clientId = ?';
        params.push(clientId);
      }
      
      // User filter
      if (userId) {
        query += ' AND osp.userId = ?';
        params.push(userId);
      }
      
      // Product filter
      if (productId) {
        query += ' AND osp.product_id = ?';
        params.push(productId);
      }
      
      query += ' ORDER BY osp.date DESC, osp.time DESC';
      
      const [results] = await db.query(query, params);
      
      res.json({ 
        success: true, 
        data: results 
      });
    } catch (error) {
      console.error('Error fetching outlet stock plans:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch outlet stock plans', 
        error: error.message 
      });
    }
  },

  // Get outlet stock plan by ID
  getOutletStockPlan: async (req, res) => {
    try {
      const { id } = req.params;
      
      const [results] = await db.query(`
        SELECT 
          osp.id,
          osp.date,
          osp.time,
          osp.userId,
          osp.clientId,
          osp.product_id,
          osp.product_name,
          COALESCE(NULLIF(l.name, ''), osp.client_name, 'Unknown') as client_name,
          osp.opening_stock,
          osp.closing_stock,
          sr.name as user_name
        FROM outlet_stock_plan osp
        LEFT JOIN SalesRep sr ON osp.userId = sr.id
        LEFT JOIN locations l ON osp.clientId = l.id
        WHERE osp.id = ?
      `, [id]);
      
      if (results.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'Outlet stock plan not found' 
        });
      }
      
      res.json({ 
        success: true, 
        data: results[0] 
      });
    } catch (error) {
      console.error('Error fetching outlet stock plan:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch outlet stock plan', 
        error: error.message 
      });
    }
  },

  // Create new outlet stock plan
  createOutletStockPlan: async (req, res) => {
    try {
      const {
        date,
        time,
        userId,
        clientId,
        product_id,
        product_name,
        client_name,
        opening_stock,
        closing_stock
      } = req.body;

      if (!date || !time || !clientId || !product_id || !product_name || !client_name) {
        return res.status(400).json({ 
          success: false, 
          message: 'Required fields missing: date, time, clientId, product_id, product_name, client_name' 
        });
      }

      // Combine date and time into datetime
      const dateTime = `${date} ${time}:00`;

      const [result] = await db.query(`
        INSERT INTO outlet_stock_plan (
          date, time, userId, clientId, product_id, product_name, 
          client_name, opening_stock, closing_stock
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [dateTime, time, userId, clientId, product_id, product_name, client_name, opening_stock || 0, closing_stock || 0]);

      // Fetch the created record
      const [newRecord] = await db.query(`
        SELECT 
          osp.id,
          osp.date,
          osp.time,
          osp.userId,
          osp.clientId,
          osp.product_id,
          osp.product_name,
          COALESCE(NULLIF(l.name, ''), osp.client_name, 'Unknown') as client_name,
          osp.opening_stock,
          osp.closing_stock,
          sr.name as user_name
        FROM outlet_stock_plan osp
        LEFT JOIN SalesRep sr ON osp.userId = sr.id
        LEFT JOIN locations l ON osp.clientId = l.id
        WHERE osp.id = ?
      `, [result.insertId]);

      res.status(201).json({ 
        success: true, 
        message: 'Outlet stock plan created successfully',
        data: newRecord[0]
      });
    } catch (error) {
      console.error('Error creating outlet stock plan:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to create outlet stock plan', 
        error: error.message 
      });
    }
  },

  // Update outlet stock plan
  updateOutletStockPlan: async (req, res) => {
    try {
      const { id } = req.params;
      const {
        date,
        time,
        userId,
        clientId,
        product_id,
        product_name,
        client_name,
        opening_stock,
        closing_stock
      } = req.body;

      const updates = [];
      const values = [];

      if (date !== undefined) { 
        updates.push('date = ?'); 
        values.push(date); 
      }
      if (time !== undefined) { 
        updates.push('time = ?'); 
        values.push(time); 
      }
      if (userId !== undefined) { 
        updates.push('userId = ?'); 
        values.push(userId); 
      }
      if (clientId !== undefined) { 
        updates.push('clientId = ?'); 
        values.push(clientId); 
      }
      if (product_id !== undefined) { 
        updates.push('product_id = ?'); 
        values.push(product_id); 
      }
      if (product_name !== undefined) { 
        updates.push('product_name = ?'); 
        values.push(product_name); 
      }
      if (client_name !== undefined) { 
        updates.push('client_name = ?'); 
        values.push(client_name); 
      }
      if (opening_stock !== undefined) { 
        updates.push('opening_stock = ?'); 
        values.push(opening_stock); 
      }
      if (closing_stock !== undefined) { 
        updates.push('closing_stock = ?'); 
        values.push(closing_stock); 
      }

      if (updates.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'No fields provided for update' 
        });
      }

      values.push(id);

      await db.query(
        `UPDATE outlet_stock_plan SET ${updates.join(', ')} WHERE id = ?`,
        values
      );

      // Fetch the updated record
      const [updatedRecord] = await db.query(`
        SELECT 
          osp.id,
          osp.date,
          osp.time,
          osp.userId,
          osp.clientId,
          osp.product_id,
          osp.product_name,
          COALESCE(NULLIF(l.name, ''), osp.client_name, 'Unknown') as client_name,
          osp.opening_stock,
          osp.closing_stock,
          sr.name as user_name
        FROM outlet_stock_plan osp
        LEFT JOIN SalesRep sr ON osp.userId = sr.id
        LEFT JOIN locations l ON osp.clientId = l.id
        WHERE osp.id = ?
      `, [id]);

      res.json({ 
        success: true, 
        message: 'Outlet stock plan updated successfully',
        data: updatedRecord[0]
      });
    } catch (error) {
      console.error('Error updating outlet stock plan:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to update outlet stock plan', 
        error: error.message 
      });
    }
  },

  // Delete outlet stock plan
  deleteOutletStockPlan: async (req, res) => {
    try {
      const { id } = req.params;
      
      const [result] = await db.query('DELETE FROM outlet_stock_plan WHERE id = ?', [id]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'Outlet stock plan not found' 
        });
      }
      
      res.json({ 
        success: true, 
        message: 'Outlet stock plan deleted successfully' 
      });
    } catch (error) {
      console.error('Error deleting outlet stock plan:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to delete outlet stock plan', 
        error: error.message 
      });
    }
  }
};

module.exports = outletStockPlanController;

