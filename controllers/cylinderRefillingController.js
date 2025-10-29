const db = require('../database/db');
const { DateTime } = require('luxon');

const cylinderRefillingController = {
  // Refill cylinders and add to stock inventory
  refillCylinders: async (req, res) => {
    const connection = await db.getConnection();
    
    try {
      const {
        cylinder_codes, // Array of cylinder_code_ids
        store_id,
        product_id, // The product to add to inventory (e.g., filled gas cylinder)
        region_id,
        notes
      } = req.body;

      // Validation
      if (!cylinder_codes || !Array.isArray(cylinder_codes) || cylinder_codes.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'cylinder_codes array is required and must contain at least one cylinder'
        });
      }

      if (!store_id) {
        return res.status(400).json({
          success: false,
          error: 'store_id is required'
        });
      }

      if (!product_id) {
        return res.status(400).json({
          success: false,
          error: 'product_id is required'
        });
      }

      // Validate that the user exists before using their ID
      let performedBy = null;
      let performedByName = 'System';
      
      if (req.user?.id) {
        // Verify user exists in database
        const [userExists] = await connection.query(
          'SELECT id, username, full_name FROM users WHERE id = ?',
          [req.user.id]
        );
        
        if (userExists.length > 0) {
          performedBy = userExists[0].id;
          performedByName = userExists[0].full_name || userExists[0].username;
        }
      }
      
      // Get current time in Nairobi timezone
      const nairobiTime = DateTime.now().setZone('Africa/Nairobi');
      const nairobiTimestamp = nairobiTime.toFormat('yyyy-MM-dd HH:mm:ss');

      await connection.beginTransaction();

      // Verify store exists
      const [storeResult] = await connection.query(
        'SELECT id, store_name FROM stores WHERE id = ? AND is_active = TRUE',
        [store_id]
      );

      if (storeResult.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: 'Invalid store_id or store is inactive'
        });
      }

      // Verify product exists
      const [productResult] = await connection.query(
        'SELECT id, product_name, cost_price FROM products WHERE id = ?',
        [product_id]
      );

      if (productResult.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: 'Invalid product_id'
        });
      }

      const product = productResult[0];
      const processedCylinders = [];
      const errors = [];

      // Process each cylinder
      for (const cylinder_code_id of cylinder_codes) {
        try {
          // Verify cylinder code exists and check its current status
          const [cylinderResult] = await connection.query(
            'SELECT id, code, status FROM cylinder_codes WHERE id = ?',
            [cylinder_code_id]
          );

          if (cylinderResult.length === 0) {
            errors.push(`Cylinder code ID ${cylinder_code_id} not found`);
            continue;
          }

          const cylinder = cylinderResult[0];

          // Check if cylinder is already refilled
          if (cylinder.status === 'REFILLED') {
            errors.push(`Cylinder ${cylinder.code} is already refilled and cannot be refilled again`);
            continue;
          }

          // Record in cylinder ledger as RECEIVED_BACK (refilled and ready)
          await connection.query(`
            INSERT INTO cylinder_ledger (
              cylinder_code_id,
              transaction_type,
              current_region_id,
              notes,
              performed_by,
              performed_by_name,
              status_before,
              status_after,
              transaction_date
            ) VALUES (?, 'RECEIVED_BACK', ?, ?, ?, ?, 'EMPTY', 'REFILLED', ?)
          `, [
            cylinder_code_id,
            region_id || null,
            notes || `Cylinder refilled and added to store ${storeResult[0].store_name}`,
            performedBy,
            performedByName,
            nairobiTimestamp
          ]);

          // Update cylinder_codes table with status and region
          if (region_id) {
            await connection.query(
              'UPDATE cylinder_codes SET current_region = ?, last_assigned_date = ?, status = ? WHERE id = ?',
              [region_id, nairobiTimestamp, 'REFILLED', cylinder_code_id]
            );
          } else {
            await connection.query(
              'UPDATE cylinder_codes SET status = ?, last_assigned_date = ? WHERE id = ?',
              ['REFILLED', nairobiTimestamp, cylinder_code_id]
            );
          }

          processedCylinders.push({
            cylinder_code_id: cylinder.id,
            cylinder_code: cylinder.code
          });

        } catch (error) {
          console.error(`Error processing cylinder ${cylinder_code_id}:`, error);
          errors.push(`Failed to process cylinder ${cylinder_code_id}: ${error.message}`);
        }
      }

      // If no cylinders were processed successfully, rollback
      if (processedCylinders.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: 'No cylinders were processed successfully',
          details: errors
        });
      }

      // Update inventory - add the quantity of refilled cylinders
      const quantityToAdd = processedCylinders.length;
      
      // Check if store_inventory record exists
      const [inventoryResult] = await connection.query(
        'SELECT id, quantity FROM store_inventory WHERE store_id = ? AND product_id = ?',
        [store_id, product_id]
      );

      let newQuantity;
      if (inventoryResult.length > 0) {
        // Update existing inventory
        newQuantity = inventoryResult[0].quantity + quantityToAdd;
        await connection.query(
          'UPDATE store_inventory SET quantity = ?, updated_at = ? WHERE id = ?',
          [newQuantity, nairobiTimestamp, inventoryResult[0].id]
        );
      } else {
        // Create new inventory record
        newQuantity = quantityToAdd;
        await connection.query(
          'INSERT INTO store_inventory (store_id, product_id, quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          [store_id, product_id, quantityToAdd, nairobiTimestamp, nairobiTimestamp]
        );
      }

      // Record inventory transaction
      const transactionNumber = `REFILL-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      const unitCost = product.cost_price || 0;
      const totalCost = unitCost * quantityToAdd;

      // For inventory_transactions, staff_id is required, so use a fallback
      // Try to get a system/default user if performedBy is null
      let staffIdForInventory = performedBy;
      if (!staffIdForInventory) {
        const [systemUser] = await connection.query(
          'SELECT id FROM users ORDER BY id ASC LIMIT 1'
        );
        staffIdForInventory = systemUser.length > 0 ? systemUser[0].id : 1;
      }

      await connection.query(`
        INSERT INTO inventory_transactions 
        (product_id, reference, amount_in, amount_out, balance, date_received, store_id, unit_cost, total_cost, staff_id) 
        VALUES (?, ?, ?, 0.00, ?, ?, ?, ?, ?, ?)
      `, [
        product_id,
        transactionNumber,
        quantityToAdd,
        newQuantity,
        nairobiTimestamp,
        store_id,
        unitCost,
        totalCost,
        staffIdForInventory
      ]);

      await connection.commit();

      res.json({
        success: true,
        message: `Successfully refilled ${processedCylinders.length} cylinder(s) and added to inventory`,
        data: {
          processed_cylinders: processedCylinders,
          inventory_updated: {
            product_id,
            product_name: product.product_name,
            store_id,
            store_name: storeResult[0].store_name,
            quantity_added: quantityToAdd,
            new_quantity: newQuantity,
            transaction_reference: transactionNumber
          },
          errors: errors.length > 0 ? errors : null
        }
      });

    } catch (error) {
      await connection.rollback();
      console.error('Error refilling cylinders:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to refill cylinders',
        details: error.message
      });
    } finally {
      connection.release();
    }
  },

  // Get available (empty) cylinders that need refilling
  getAvailableCylinders: async (req, res) => {
    try {
      const { region_id } = req.query;
      
      let whereClause = '';
      const queryParams = [];

      if (region_id) {
        whereClause = 'WHERE cc.current_region = ?';
        queryParams.push(region_id);
      }

      const [cylinders] = await db.query(`
        SELECT 
          cc.id,
          cc.code,
          cc.current_region,
          r.name as region_name,
          cc.last_assigned_date,
          COALESCE(cc.status, 'AVAILABLE') as current_status
        FROM cylinder_codes cc
        LEFT JOIN Regions r ON cc.current_region = r.id
        ${whereClause}
        ORDER BY cc.code ASC
      `, queryParams);

      res.json({
        success: true,
        data: cylinders
      });
    } catch (error) {
      console.error('Error fetching available cylinders:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch available cylinders'
      });
    }
  },

  // Get refilling history
  getRefillingHistory: async (req, res) => {
    try {
      const { 
        start_date, 
        end_date, 
        store_id,
        page = 1,
        limit = 50
      } = req.query;

      let whereClause = "WHERE cl.transaction_type = 'RECEIVED_BACK' AND cl.status_after = 'REFILLED'";
      const queryParams = [];

      if (start_date) {
        whereClause += ' AND cl.transaction_date >= ?';
        queryParams.push(start_date);
      }

      if (end_date) {
        whereClause += ' AND cl.transaction_date <= ?';
        queryParams.push(end_date);
      }

      const offset = (page - 1) * limit;

      const [history] = await db.query(`
        SELECT 
          cl.id,
          cl.cylinder_code_id,
          cc.code as cylinder_code,
          cl.transaction_date,
          cl.notes,
          cl.performed_by_name,
          cl.current_region_id,
          r.name as region_name
        FROM cylinder_ledger cl
        LEFT JOIN cylinder_codes cc ON cl.cylinder_code_id = cc.id
        LEFT JOIN Regions r ON cl.current_region_id = r.id
        ${whereClause}
        ORDER BY cl.transaction_date DESC
        LIMIT ? OFFSET ?
      `, [...queryParams, parseInt(limit), offset]);

      const [countResult] = await db.query(`
        SELECT COUNT(*) as total
        FROM cylinder_ledger cl
        ${whereClause}
      `, queryParams);

      res.json({
        success: true,
        data: history,
        pagination: {
          current_page: parseInt(page),
          total_items: countResult[0].total,
          total_pages: Math.ceil(countResult[0].total / limit),
          items_per_page: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Error fetching refilling history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch refilling history'
      });
    }
  }
};

module.exports = cylinderRefillingController;

