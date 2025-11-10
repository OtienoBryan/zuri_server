const db = require('../database/db');

const webhookController = {
  // Webhook endpoint for order delivery status updates
  handleOrderDeliveryStatus: async (req, res) => {
    try {
      console.log('Webhook received for order delivery status:', req.body);
      
      const { 
        action,
        order_id, 
        so_number, 
        status, 
        delivery_notes, 
        recipient_name, 
        recipient_phone,
        timestamp 
      } = req.body;
      
      // Special action: Dump all sales_order IDs
      if (action === 'dump' || action === 'list_all') {
        try {
          const connection = await db.getConnection();
          try {
            const [orders] = await connection.query(
              `SELECT id, so_number, customer_id, status, my_status, order_date, total_amount 
               FROM sales_orders 
               ORDER BY id ASC`
            );
            
            const orderIds = orders.map(order => order.id);
            
            console.log(`✅ Dumped ${orders.length} sales_order IDs via webhook`);
            
            res.json({
              success: true,
              message: `Retrieved ${orders.length} sales orders`,
              count: orders.length,
              order_ids: orderIds,
              orders: orders
            });
            
            return;
          } finally {
            connection.release();
          }
        } catch (error) {
          console.error('Error dumping sales orders:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to dump sales orders: ' + error.message
          });
        }
      }
      
      // Validate required fields for status update
      if (!order_id && !so_number) {
        return res.status(400).json({ 
          success: false, 
          error: 'Either order_id or so_number is required' 
        });
      }
      
      if (!status) {
        return res.status(400).json({ 
          success: false, 
          error: 'status is required' 
        });
      }
      
      // Valid status values
      const validStatuses = ['draft', 'confirmed', 'shipped', 'delivered', 'cancelled'];
      if (!validStatuses.includes(status.toLowerCase())) {
        return res.status(400).json({ 
          success: false, 
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
        });
      }
      
      // Get connection for transaction
      const connection = await db.getConnection();
      
      try {
        await connection.beginTransaction();
        
        // Find the order by ID or SO number
        let whereClause;
        let queryParams;
        
        if (order_id) {
          whereClause = 'WHERE id = ?';
          queryParams = [order_id];
        } else {
          whereClause = 'WHERE so_number = ?';
          queryParams = [so_number];
        }
        
        const [orders] = await connection.query(
          `SELECT id, so_number, customer_id, cylinder_code_id FROM sales_orders ${whereClause}`,
          queryParams
        );
        
        if (orders.length === 0) {
          await connection.rollback();
          return res.status(404).json({ 
            success: false, 
            error: 'Sales order not found' 
          });
        }
        
        const order = orders[0];
        const statusLower = status.toLowerCase();
        
        // Map status to my_status
        let myStatus;
        switch (statusLower) {
          case 'draft':
            myStatus = 0;
            break;
          case 'confirmed':
            myStatus = 1;
            break;
          case 'shipped':
            myStatus = 2;
            break;
          case 'delivered':
            myStatus = 3;
            break;
          case 'cancelled':
            myStatus = 4;
            break;
          default:
            myStatus = 0;
        }
        
        // Build update query dynamically
        const updateFields = [];
        const updateValues = [];
        
        updateFields.push('status = ?');
        updateValues.push(statusLower);
        
        updateFields.push('my_status = ?');
        updateValues.push(myStatus);
        
        // Add delivery notes and recipient info if provided
        if (delivery_notes || (recipient_name && recipient_phone)) {
          let finalNotes = '';
          
          if (delivery_notes) {
            finalNotes = delivery_notes;
          }
          
          if (recipient_name && recipient_phone) {
            const recipientNotes = `Delivered to: ${recipient_name} (${recipient_phone})`;
            if (finalNotes) {
              finalNotes = `${finalNotes}. ${recipientNotes}`;
            } else {
              finalNotes = recipientNotes;
            }
          }
          
          updateFields.push('delivery_notes = ?');
          updateValues.push(finalNotes);
        }
        
        updateFields.push('updated_at = NOW()');
        
        // Update the sales order
        updateValues.push(order.id); // Add order.id for WHERE clause
        await connection.query(
          `UPDATE sales_orders SET ${updateFields.join(', ')} WHERE id = ?`,
          updateValues
        );
        
        // Handle cylinder status update if order is delivered and has cylinder
        if (statusLower === 'delivered' && order.cylinder_code_id) {
          await connection.query(
            'UPDATE cylinder_codes SET status = ? WHERE id = ?',
            ['DELIVERED', order.cylinder_code_id]
          );
          
          // Log in cylinder ledger
          const notes = delivery_notes || `Order ${order.so_number} delivered via webhook`;
          const performedByName = recipient_name ? 
            `Webhook - ${recipient_name}` : 'Webhook';
          
          await connection.query(`
            INSERT INTO cylinder_ledger (
              cylinder_code_id,
              transaction_type,
              sales_order_id,
              so_number,
              customer_id,
              transaction_date,
              notes,
              performed_by_name,
              status_before,
              status_after
            ) VALUES (?, 'DELIVERED', ?, ?, ?, NOW(), ?, ?, 'AVAILABLE', 'DELIVERED')
          `, [
            order.cylinder_code_id,
            order.id,
            order.so_number,
            order.customer_id,
            notes,
            performedByName
          ]);
          
          console.log(`✅ Cylinder ${order.cylinder_code_id} status updated to DELIVERED`);
        }
        
        await connection.commit();
        
        console.log(`✅ Order ${order.so_number} status updated to ${status} via webhook`);
        
        // Get the updated order
        const [updatedOrders] = await connection.query(
          `SELECT 
            so.*, 
            so.name as customer_name, 
            so.phone as customer_phone,
            so.address as customer_address
          FROM sales_orders so
          WHERE so.id = ?`,
          [order.id]
        );
        
        res.json({ 
          success: true, 
          message: 'Order delivery status updated successfully',
          data: updatedOrders[0]
        });
        
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      
    } catch (error) {
      console.error('Error handling webhook:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to process webhook: ' + error.message 
      });
    }
  }
};

module.exports = webhookController;

