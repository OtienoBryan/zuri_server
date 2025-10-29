const db = require('../database/db');
const { DateTime } = require('luxon');

const salesOrderController = {
  // Get all sales orders
  getAllSalesOrders: async (req, res) => {
    try {
      console.log('Fetching sales orders with filters:', req.query);
      
      const { client_id, status } = req.query;
      let whereClause = 'WHERE so.my_status IN (1, 2, 3)';
      let queryParams = [];
      
      // Add client_id filter if provided
      if (client_id) {
        whereClause += ' AND so.customer_id = ?';
        queryParams.push(client_id);
      }
      
      // Add status filter if provided (comma-separated values)
      if (status) {
        const statusArray = status.split(',').map(s => s.trim());
        const placeholders = statusArray.map(() => '?').join(',');
        whereClause = whereClause.replace('so.my_status IN (1, 2, 3)', `so.my_status IN (${placeholders})`);
        queryParams = [...statusArray, ...queryParams];
      }
      
      console.log('Final WHERE clause:', whereClause);
      console.log('Query parameters:', queryParams);
      
      const [rows] = await db.query(`
        SELECT 
          so.*, 
          c.name as customer_name, 
          c.phone as customer_phone,
          c.address as customer_address,
          c.balance as customer_balance,
          u.full_name as created_by_name,
          sr.name as salesrep,
          cc.code as cylinder_code
        FROM sales_orders so
        LEFT JOIN Clients c ON so.customer_id = c.id
        LEFT JOIN users u ON so.created_by = u.id
        LEFT JOIN SalesRep sr ON so.salesrep = sr.id
        LEFT JOIN cylinder_codes cc ON so.cylinder_code_id = cc.id
        ${whereClause}
        ORDER BY so.created_at DESC
      `, queryParams);
      
      console.log('Query result rows:', rows.length);
      if (rows.length > 0) {
        console.log('Sample order:', rows[0]);
        console.log('Sample order my_status:', rows[0].my_status);
      }
      
      // Get items for each sales order
      for (let order of rows) {
        const [items] = await db.query(`
          SELECT 
            soi.*, 
            p.product_name, 
            p.product_code, 
            p.unit_of_measure,
            p.cylinder_type
          FROM sales_order_items soi
          LEFT JOIN products p ON soi.product_id = p.id
          WHERE soi.sales_order_id = ?
        `, [order.id]);
        
        // Map product fields into a product object for each item
        order.items = items.map(item => ({
          id: item.id,
          sales_order_id: item.sales_order_id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: parseFloat(item.unit_price),
          total_price: parseFloat(item.total_price),
          tax_type: item.tax_type,
          tax_amount: parseFloat(item.tax_amount),
          net_price: parseFloat(item.net_price),
          order_notes: item.order_notes,
          product: {
            id: item.product_id,
            product_name: item.product_name || `Product ${item.product_id}`,
            product_code: item.product_code || 'No Code',
            unit_of_measure: item.unit_of_measure || 'PCS',
            cylinder_type: item.cylinder_type
          }
        }));
      }
      
      console.log('Final response data length:', rows.length);
      console.log('Orders by status:');
      const statusCounts = rows.reduce((acc, order) => {
        acc[order.my_status] = (acc[order.my_status] || 0) + 1;
        return acc;
      }, {});
      console.log(statusCounts);
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('Error fetching sales orders:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch sales orders' });
    }
  },

  // Get all sales orders (including draft orders with my_status = 0)
  getAllSalesOrdersIncludingDrafts: async (req, res) => {
    try {
      console.log('Fetching all sales orders (including drafts)...');
      
      // First, let's check how many sales orders exist in total
      const [totalOrders] = await db.query('SELECT COUNT(*) as total FROM sales_orders');
      console.log('Total sales orders in database:', totalOrders[0].total);
      
      // Check how many have my_status = 0 (drafts)
      const [draftOrders] = await db.query('SELECT COUNT(*) as drafts FROM sales_orders WHERE my_status = 0');
      console.log('Sales orders with my_status = 0 (drafts):', draftOrders[0].drafts);
      
      // Check how many have my_status = 1 (confirmed)
      const [confirmedOrders] = await db.query('SELECT COUNT(*) as confirmed FROM sales_orders WHERE my_status = 1');
      console.log('Sales orders with my_status = 1 (confirmed):', confirmedOrders[0].confirmed);
      
      const [rows] = await db.query(`
        SELECT 
          so.*, 
          c.name as customer_name, 
          c.phone as customer_phone,
          c.address as customer_address,
          c.balance as customer_balance,
          c.client_type,
          oc.name as client_type_name,
          c.outlet_account,
          oa.name as outlet_account_name,
          u.full_name as created_by_name,
          sr.name as salesrep,
          r.name as rider_name,
          r.contact as rider_contact,
          receiver.name as received_by_name,
          cc.code as cylinder_code
        FROM sales_orders so
        LEFT JOIN Clients c ON so.customer_id = c.id
        LEFT JOIN outlet_categories oc ON c.client_type = oc.id
        LEFT JOIN outlet_accounts oa ON c.outlet_account = oa.id
        LEFT JOIN users u ON so.created_by = u.id
        LEFT JOIN SalesRep sr ON so.salesrep = sr.id
        LEFT JOIN Riders r ON so.rider_id = r.id
        LEFT JOIN staff receiver ON so.received_by = receiver.id
        LEFT JOIN cylinder_codes cc ON so.cylinder_code_id = cc.id
        ORDER BY so.created_at DESC
      `);
      
      console.log('Query result rows:', rows.length);
      if (rows.length > 0) {
        console.log('Sample order:', rows[0]);
      }
      
      // Get items for each sales order
      for (let order of rows) {
        const [items] = await db.query(`
          SELECT 
            soi.*, 
            p.product_name, 
            p.product_code, 
            p.unit_of_measure,
            p.cylinder_type
          FROM sales_order_items soi
          LEFT JOIN products p ON soi.product_id = p.id
          WHERE soi.sales_order_id = ?
        `, [order.id]);
        
        // Map product fields into a product object for each item
        order.items = items.map(item => ({
          id: item.id,
          sales_order_id: item.sales_order_id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: parseFloat(item.unit_price),
          total_price: parseFloat(item.total_price),
          tax_type: item.tax_type,
          tax_amount: parseFloat(item.tax_amount),
          net_price: parseFloat(item.net_price),
          order_notes: item.order_notes,
          product: {
            id: item.product_id,
            product_name: item.product_name || `Product ${item.product_id}`,
            product_code: item.product_code || 'No Code',
            unit_of_measure: item.unit_of_measure || 'PCS',
            cylinder_type: item.cylinder_type
          }
        }));
      }
      
      console.log('Final response data length:', rows.length);
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('Error fetching all sales orders:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch all sales orders' });
    }
  },

  // Get sales order by ID
  getSalesOrderById: async (req, res) => {
    try {
      const { id } = req.params;
      // Get sales order details with all customer fields
      const [salesOrders] = await db.query(`
        SELECT 
          so.*, 
          c.id as client_id,
          c.name,
          c.contact,
          c.email,
          c.address,
          c.tax_pin,
          u.full_name as created_by_name,
          sr.name as salesrep,
          r.name as rider_name,
          r.contact as rider_contact,
          cc.code as cylinder_code
        FROM sales_orders so
        LEFT JOIN Clients c ON so.customer_id = c.id
        LEFT JOIN users u ON so.created_by = u.id
        LEFT JOIN SalesRep sr ON so.salesrep = sr.id
        LEFT JOIN Riders r ON so.rider_id = r.id
        LEFT JOIN cylinder_codes cc ON so.cylinder_code_id = cc.id
        WHERE so.id = ?
      `, [id]);
      if (salesOrders.length === 0) {
        return res.status(404).json({ success: false, error: 'Sales order not found' });
      }
      // Get sales order items
      const [items] = await db.query(`
        SELECT 
          soi.*, 
          p.product_name, 
          p.product_code, 
          p.unit_of_measure,
          p.cylinder_type
        FROM sales_order_items soi
        LEFT JOIN products p ON soi.product_id = p.id
        WHERE soi.sales_order_id = ?
      `, [id]);
      const salesOrder = salesOrders[0];
      // Map product fields into a product object for each item
      salesOrder.items = items.map(item => ({
        ...item,
        unit_price: parseFloat(item.unit_price),
        total_price: parseFloat(item.total_price),
        tax_amount: parseFloat(item.tax_amount),
        net_price: parseFloat(item.net_price),
        order_notes: item.order_notes,
        product: {
          id: item.product_id,
          product_name: item.product_name,
          product_code: item.product_code,
          unit_of_measure: item.unit_of_measure,
          cylinder_type: item.cylinder_type
        }
      }));
      // Construct customer object
      salesOrder.customer = {
        id: salesOrder.client_id,
        name: salesOrder.name,
        contact: salesOrder.contact,
        email: salesOrder.email,
        address: salesOrder.address,
        tax_pin: salesOrder.tax_pin
      };
      res.json({ success: true, data: salesOrder });
    } catch (error) {
      console.error('Error fetching sales order:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch sales order' });
    }
  },

  // Create new sales order
  createSalesOrder: async (req, res) => {
    const connection = await db.getConnection();
    try {
      console.log('=== CREATE SALES ORDER START ===');
      console.log('Request body:', JSON.stringify(req.body, null, 2));
      
      await connection.beginTransaction();
      const { customer_id, client_id, sales_rep_id, order_date, expected_delivery_date, notes, subtotal, tax_amount, total_amount, items } = req.body;
      
      // Use either customer_id or client_id (for compatibility)
      const clientId = client_id || customer_id;
      console.log('Client ID:', clientId);
      console.log('Order date:', order_date);
      console.log('Items:', JSON.stringify(items, null, 2));
      
      // Client validation removed - orders can be created without checking client exists
      
      // Use client_id directly since sales_orders table uses client_id
      const clientIdToUse = clientId;
      
      // Generate unique SO number by finding the highest existing number
      let soNumber;
      let attempts = 0;
      const maxAttempts = 10;
      
      do {
        attempts++;
        
        // Get the highest existing SO number
        const [maxSO] = await connection.query(`
          SELECT so_number FROM sales_orders 
          WHERE so_number LIKE 'SO-%'
          ORDER BY LENGTH(so_number) DESC, so_number DESC 
          LIMIT 1
        `);
        
        let nextNumber = 1;
        if (maxSO.length > 0) {
          // Extract the number part and increment
          const soNumberStr = maxSO[0].so_number;
          const numberPart = soNumberStr.substring(3); // Remove 'SO-' prefix
          const currentNumber = parseInt(numberPart) || 0;
          nextNumber = currentNumber + attempts;
        } else {
          nextNumber = attempts;
        }
        
        soNumber = `SO-${String(nextNumber).padStart(6, '0')}`;
        
        // Check if this SO number already exists
        const [existingSO] = await connection.query('SELECT id FROM sales_orders WHERE so_number = ?', [soNumber]);
        
        if (existingSO.length === 0) {
          break; // Found a unique number
        }
        
        console.log(`SO number ${soNumber} already exists, trying next...`);
      } while (attempts < maxAttempts);
      
      if (attempts >= maxAttempts) {
        throw new Error('Unable to generate unique SO number after multiple attempts');
      }
      
      console.log('Generated unique SO number:', soNumber, 'after', attempts, 'attempts');
      
      // Use the totals sent from frontend (unit_price is tax-exclusive)
      console.log('Using frontend totals - Subtotal:', subtotal, 'Tax Amount:', tax_amount, 'Total Amount:', total_amount);
      
      // Validate that the totals match our calculations for consistency
      let calculatedSubtotal = 0;
      let calculatedTaxAmount = 0;
      let calculatedTotalAmount = 0;
      
      for (const item of items) {
        const net = Number(item.quantity) * Number(item.unit_price);
        const taxType = item.tax_type || '16%';
        const taxRate = taxType === '16%' ? 0.16 : 0; // zero_rated/exempted => 0
        const itemTaxAmount = +(net * taxRate).toFixed(2);
        const itemTotal = +(net + itemTaxAmount).toFixed(2);
        
        calculatedSubtotal += net;
        calculatedTaxAmount += itemTaxAmount;
        calculatedTotalAmount += itemTotal;
      }
      
      console.log('Frontend totals - Subtotal:', subtotal, 'Tax Amount:', tax_amount, 'Total Amount:', total_amount);
      console.log('Calculated totals - Subtotal:', calculatedSubtotal, 'Tax Amount:', calculatedTaxAmount, 'Total Amount:', calculatedTotalAmount);
      
      // Use frontend totals but log any discrepancies
      if (Math.abs(subtotal - calculatedSubtotal) > 0.01 || 
          Math.abs(tax_amount - calculatedTaxAmount) > 0.01 || 
          Math.abs(total_amount - calculatedTotalAmount) > 0.01) {
        console.log('WARNING: Frontend totals differ from calculated totals');
        console.log('Using frontend totals as requested');
      }
      
      // Create order in sales_orders table
      console.log('Creating order in sales_orders table...');
      const [soResult] = await connection.query(`
        INSERT INTO sales_orders (
          so_number, customer_id, salesrep, order_date, expected_delivery_date, 
          notes, status, subtotal, tax_amount, total_amount, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, NOW(), NOW())
      `, [soNumber, clientIdToUse, sales_rep_id || null, order_date, expected_delivery_date, notes, subtotal, tax_amount, total_amount, 1]);
      const salesOrderId = soResult.insertId;
      console.log('Order created with ID:', salesOrderId);
      
      // Validate that all products exist
      console.log('Validating products...');
      for (const item of items) {
        console.log('Checking product ID:', item.product_id);
        const [productCheck] = await connection.query('SELECT id FROM products WHERE id = ?', [item.product_id]);
        console.log('Product check result:', productCheck);
        if (productCheck.length === 0) {
          console.log('Product not found, returning error');
          await connection.rollback();
          connection.release();
          return res.status(400).json({ 
            success: false, 
            error: `Product with ID ${item.product_id} not found` 
          });
        }
      }
      console.log('All products validated');
      
      // Create sales order items
      console.log('Creating sales order items...');
      for (const item of items) {
        console.log('Creating item:', item);
        const taxType = item.tax_type || '16%';
        const taxRate = taxType === '16%' ? 0.16 : 0; // zero_rated/exempted => 0
        const netPrice = Number(item.quantity) * Number(item.unit_price);
        const itemTaxAmount = +(netPrice * taxRate).toFixed(2);
        const totalPrice = +(netPrice + itemTaxAmount).toFixed(2);
        
        console.log('Item calculations:', { 
          quantity: item.quantity, 
          unitPrice: item.unit_price, 
          netPrice, 
          taxAmount: itemTaxAmount, 
          totalPrice 
        });
        
        // Try to insert with order_notes if column exists, otherwise without it
        try {
          await connection.query(`
            INSERT INTO sales_order_items (
              sales_order_id, product_id, quantity, unit_price, tax_type, tax_amount, net_price, total_price, order_notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [salesOrderId, item.product_id, item.quantity, item.unit_price, item.tax_type || '16%', item.tax_amount || itemTaxAmount, totalPrice, totalPrice, item.order_notes || null]);
        } catch (insertError) {
          // If order_notes column doesn't exist, insert without it
          if (insertError.code === 'ER_BAD_FIELD_ERROR') {
            console.log('order_notes column does not exist, inserting without it');
            await connection.query(`
              INSERT INTO sales_order_items (
                sales_order_id, product_id, quantity, unit_price, tax_type, tax_amount, net_price, total_price
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [salesOrderId, item.product_id, item.quantity, item.unit_price, item.tax_type || '16%', item.tax_amount || itemTaxAmount, totalPrice, totalPrice]);
          } else {
            throw insertError;
          }
        }
      }
      console.log('All items created, committing transaction...');
      await connection.commit();
      console.log('Transaction committed successfully');
      // Get the created order with customer details
      const [createdSO] = await db.query(`
        SELECT 
          so.*, 
          c.name as customer_name,
          c.phone as customer_phone,
          c.address as customer_address
        FROM sales_orders so
        LEFT JOIN Clients c ON so.customer_id = c.id
        WHERE so.id = ?
      `, [salesOrderId]);
      
      // Fetch items with product details (handle if cylinder_type doesn't exist)
      const [orderItems] = await db.query(`
        SELECT 
          soi.*, 
          p.product_name, 
          p.product_code, 
          p.unit_of_measure
        FROM sales_order_items soi
        LEFT JOIN products p ON soi.product_id = p.id
        WHERE soi.sales_order_id = ?
      `, [salesOrderId]);
      
      // Add items to the response
      if (createdSO[0]) {
        createdSO[0].items = orderItems;
      }
      res.status(201).json({ 
        success: true, 
        data: createdSO[0],
        message: 'Sales order created successfully' 
      });
    } catch (error) {
      await connection.rollback();
      console.error('=== ERROR CREATING SALES ORDER ===');
      console.error('Error details:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      res.status(500).json({ success: false, error: 'Failed to create sales order' });
    } finally {
      connection.release();
      console.log('=== CREATE SALES ORDER END ===');
    }
  },

  // Update sales order
  updateSalesOrder: async (req, res) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const { id } = req.params;
      const { customer_id, client_id, sales_rep_id, order_date, expected_delivery_date, notes, status, items } = req.body;
      
      // Get the current user ID from the request
      const currentUserId = req.user?.id || 1; // Default to user ID 1 if not available
      
      // Check if sales order exists and get current data
      const [existingSO] = await connection.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
      if (existingSO.length === 0) {
        return res.status(404).json({ success: false, error: 'Sales order not found' });
      }
      
      // Use provided client_id or customer_id, otherwise keep existing client_id
      const clientId = client_id || customer_id || existingSO[0].client_id;
      
      const itemsLocked = (existingSO[0].my_status >= 1);
      let subtotal = 0;
      let taxAmount = 0;
      let totalAmount = 0;

      if (itemsLocked) {
        // Use existing DB items when order is approved/locked
        const [dbItems] = await connection.query(
          'SELECT quantity, unit_price, tax_type FROM sales_order_items WHERE sales_order_id = ?',
          [id]
        );
        for (const item of dbItems) {
          const net = Number(item.quantity) * Number(item.unit_price);
          const rate = (item.tax_type === '16%') ? 0.16 : 0;
          const itemTaxAmount = +(net * rate).toFixed(2);
          const itemTotal = +(net + itemTaxAmount).toFixed(2);
          subtotal += net;
          taxAmount += itemTaxAmount;
          totalAmount += itemTotal;
        }
        subtotal = +subtotal.toFixed(2);
        taxAmount = +taxAmount.toFixed(2);
        totalAmount = +totalAmount.toFixed(2);
      } else {
        // If only changing status to cancelled/declined without items, preserve existing totals
        const statusMapPreview = {
          'cancel': 'cancelled',
          'cancelled': 'cancelled',
          'canceled': 'cancelled',
          'decline': 'declined',
          'declined': 'declined'
        };
        const incomingKey = (status !== undefined && status !== null) ? String(status).toLowerCase() : '';
        const incomingStatus = statusMapPreview[incomingKey];
        const statusOnly = (incomingStatus === 'cancelled' || incomingStatus === 'declined') && (!Array.isArray(items) || items.length === 0);
        if (statusOnly) {
          subtotal = Number(existingSO[0].subtotal || 0);
          taxAmount = Number(existingSO[0].tax_amount || 0);
          totalAmount = Number(existingSO[0].total_amount || 0);
        } else {
        // Validate items and calculate totals from payload
        if (!Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ success: false, error: 'Order must include at least one item' });
        }

        for (const item of items) {
          if (!item || !item.product_id || Number(item.product_id) <= 0) {
            return res.status(400).json({ success: false, error: 'Each item must have a valid product selected' });
          }
          if (!item.quantity || Number(item.quantity) <= 0) {
            return res.status(400).json({ success: false, error: 'Item quantity must be greater than 0' });
          }
          if (item.unit_price === undefined || item.unit_price === null || Number(item.unit_price) < 0) {
            return res.status(400).json({ success: false, error: 'Item unit price must be 0 or greater' });
          }
          const [productCheck] = await connection.query('SELECT id FROM products WHERE id = ?', [item.product_id]);
          if (productCheck.length === 0) {
            return res.status(400).json({ success: false, error: `Product with ID ${item.product_id} not found` });
          }
        }

        // Calculate totals as tax-exclusive using per-item tax_type
        for (const item of items) {
          const net = Number(item.quantity) * Number(item.unit_price);
          const rate = (item.tax_type === '16%') ? 0.16 : 0; // zero_rated/exempted => 0
          const itemTaxAmount = +(net * rate).toFixed(2);
          const itemTotal = +(net + itemTaxAmount).toFixed(2);
          subtotal += net;
          taxAmount += itemTaxAmount;
          totalAmount += itemTotal;
        }
        subtotal = +subtotal.toFixed(2);
        taxAmount = +taxAmount.toFixed(2);
        totalAmount = +totalAmount.toFixed(2);
        }
      }
      
      // Map numeric status to string status for database
      const statusMap = {
        '0': 'draft',
        '1': 'confirmed',
        '2': 'shipped',
        '3': 'delivered',
        // numeric shortcuts that map directly to final strings (as per user's change)
        '4': 'cancelled',
        '5': 'declined',
        // string inputs from UI
        'cancel': 'cancelled',
        'cancelled': 'cancelled',
        'canceled': 'cancelled',
        'declined': 'declined',
        'declined': 'declined'
      };
      const statusKey = (status !== undefined && status !== null) ? String(status).trim().toLowerCase() : '';
      const statusString = statusMap[statusKey] || status || existingSO[0].status;
      
      // Determine my_status based on status value (force set for cancel/decline)
      let myStatus = existingSO[0].my_status || 0;
      if (statusString === 'confirmed' && existingSO[0].status !== 'confirmed') {
        myStatus = 1; // approved on confirmation
      }
      if (statusString === 'cancelled') {
        myStatus = 4;
      }
      if (statusString === 'declined') {
        myStatus = 5;
      }
      
      // Update sales order - preserve existing values if not provided
      await connection.query(`
        UPDATE sales_orders 
        SET client_id = ?, 
            salesrep = COALESCE(?, salesrep),
            order_date = COALESCE(?, order_date), 
            expected_delivery_date = COALESCE(?, expected_delivery_date), 
            status = ?,
            my_status = ?,
            subtotal = ?,
            tax_amount = ?,
            total_amount = ?, 
            notes = COALESCE(?, notes),
            updated_at = NOW()
        WHERE id = ?
      `, [clientId, sales_rep_id, order_date, expected_delivery_date, statusString, myStatus, subtotal, taxAmount, totalAmount, notes, id]);
      
      if (!itemsLocked) {
        const statusOnlyFinal = (statusString === 'cancelled' || statusString === 'declined') && (!Array.isArray(items) || items.length === 0);
        if (!statusOnlyFinal) {
        // Delete and recreate items only if not approved/locked
        await connection.query('DELETE FROM sales_order_items WHERE sales_order_id = ?', [id]);
        for (const item of items) {
          const net = Number(item.quantity) * Number(item.unit_price);
          const rate = (item.tax_type === '16%') ? 0.16 : 0;
          const itemTax = +(net * rate).toFixed(2);
          const totalPrice = +(net + itemTax).toFixed(2);
          await connection.query(`
            INSERT INTO sales_order_items (
              sales_order_id, product_id, quantity, unit_price, tax_amount, total_price, tax_type, net_price
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [id, item.product_id, item.quantity, item.unit_price, itemTax, totalPrice, item.tax_type || '16%', net]);
        }
        }
      }
      
      // Create journal entries and update client ledger when order is approved (status changes to confirmed)
      if (statusString === 'confirmed' && existingSO[0].status !== 'confirmed') {
        console.log('Creating journal entries and updating client ledger for approved order:', id);
        console.log('Status changed from:', existingSO[0].status, 'to:', statusString);
        console.log('Condition met: statusString === "confirmed" && existingSO[0].status !== "confirmed"');
        
        // Get required accounts
        const [arAccount] = await connection.query(
          'SELECT id FROM chart_of_accounts WHERE id = ? AND is_active = 1',
          ['140'] // Accounts Receivable account code
        );
        
        const [salesAccount] = await connection.query(
          'SELECT id FROM chart_of_accounts WHERE id = ? AND is_active = 1',
          ['53'] // Sales Revenue account code
        );
        
        const [taxAccount] = await connection.query(
          'SELECT id FROM chart_of_accounts WHERE id = ? AND is_active = 1',
          ['35'] // Sales Tax Payable account code
        );
        
        if (arAccount.length && salesAccount.length) {
          console.log('Creating journal entry for order:', id);
          console.log('AR Account found:', arAccount[0]);
          console.log('Sales Account found:', salesAccount[0]);
          console.log('Tax Account found:', taxAccount[0] || 'Not found');
          console.log('Current User ID:', currentUserId);
          console.log('Total Amount:', totalAmount);
          
          // Create journal entry
          const [journalResult] = await connection.query(
            `INSERT INTO journal_entries (entry_number, entry_date, reference, description, total_debit, total_credit, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, 'posted', ?)`,
            [
              `JE-SO-${id}-${Date.now()}`,
              order_date || existingSO[0].order_date,
              `SO-${id}`,
              `Sales order approved - ${existingSO[0].so_number}`,
              totalAmount,
              totalAmount,
              currentUserId
            ]
          );
          const journalEntryId = journalResult.insertId;
          console.log('Journal entry created with ID:', journalEntryId);
          
          // Debit Accounts Receivable
          await connection.query(
            `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
             VALUES (?, ?, ?, 0, ?)`,
            [journalEntryId, arAccount[0].id, totalAmount, `Sales order ${existingSO[0].so_number}`]
          );
          
          // Credit Sales Revenue
          await connection.query(
            `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
             VALUES (?, ?, 0, ?, ?)`,
            [journalEntryId, salesAccount[0].id, subtotal, `Sales revenue for order ${existingSO[0].so_number}`]
          );
          
          // Credit Sales Tax Payable (if tax account exists and tax amount > 0)
          if (taxAccount.length > 0 && taxAmount > 0) {
            await connection.query(
              `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
               VALUES (?, ?, 0, ?, ?)`,
              [journalEntryId, taxAccount[0].id, taxAmount, `Sales tax for order ${existingSO[0].so_number}`]
            );
          }
          
          // Update client ledger
          const [lastClientLedger] = await connection.query(
            'SELECT running_balance FROM client_ledger WHERE client_id = ? ORDER BY date DESC, id DESC LIMIT 1',
            [clientId]
          );
          
          const prevBalance = lastClientLedger.length > 0 ? parseFloat(lastClientLedger[0].running_balance) : 0;
          const newBalance = prevBalance + totalAmount; // Debit increases the receivable balance
          
          await connection.query(
            `INSERT INTO client_ledger (client_id, date, description, reference_type, reference_id, debit, credit, running_balance)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              clientId,
              order_date || existingSO[0].order_date,
              `Sales order - ${existingSO[0].so_number}`,
              'sales_order',
              id,
              totalAmount,
              0,
              newBalance
            ]
          );
          
          console.log('Journal entries and client ledger updated successfully for order:', id);
          console.log('Client balance updated from', prevBalance, 'to', newBalance);
        } else {
          console.error('Required accounts not found for journal entry creation');
          console.error('AR Account (ID: 140):', arAccount);
          console.error('Sales Account (ID: 53):', salesAccount);
          if (taxAccount.length === 0) {
            console.warn('Tax Account (ID: 35) not found - tax entries will be skipped');
          }
        }
      } else {
        console.log('Journal entries not created - condition not met:');
        console.log('  statusString:', statusString);
        console.log('  existingSO[0].status:', existingSO[0].status);
        console.log('  statusString === "confirmed":', statusString === 'confirmed');
        console.log('  existingSO[0].status !== "confirmed":', existingSO[0].status !== 'confirmed');
      }
      
      await connection.commit();
      // Best-effort update of legacy column if it exists
      try {
        await connection.query('UPDATE sales_orders SET my__status = ? WHERE id = ?', [myStatus, id]);
      } catch (_) {}

      console.log('Sales order updated successfully:', id);
      console.log('Status changed to:', statusString, 'my_status set to:', myStatus);
      res.json({ success: true, message: 'Sales order updated successfully', status: statusString, my_status: myStatus });
    } catch (error) {
      await connection.rollback();
      console.error('=== ERROR UPDATING SALES ORDER ===');
      console.error('Error details:', error);
      console.error('Error message:', error.message);
      console.error('Request body:', req.body);
      console.error('Sales order ID:', req.params.id);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to update sales order',
        details: error.message 
      });
    } finally {
      connection.release();
    }
  },

  // Delete sales order
  deleteSalesOrder: async (req, res) => {
    try {
      const { id } = req.params;
      await db.query('DELETE FROM sales_order_items WHERE sales_order_id = ?', [id]);
      const [result] = await db.query('DELETE FROM sales_orders WHERE id = ?', [id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, error: 'Sales order not found' });
      }
      res.json({ success: true, message: 'Sales order deleted successfully' });
    } catch (error) {
      console.error('Error deleting sales order:', error);
      res.status(500).json({ success: false, error: 'Failed to delete sales order' });
    }
  },

  // Assign a rider to a sales order
  assignRider: async (req, res) => {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();
      
      const { id } = req.params;
      const { riderId, regionId, cylinderCodeId } = req.body;
      
      if (!riderId) {
        return res.status(400).json({ success: false, error: 'riderId is required' });
      }
      
      if (!regionId) {
        return res.status(400).json({ success: false, error: 'regionId is required' });
      }
      
      if (!cylinderCodeId) {
        return res.status(400).json({ success: false, error: 'cylinderCodeId is required' });
      }
      
      // Check if sales order exists and get its details
      const [existingSO] = await connection.query(
        'SELECT id, so_number, my_status FROM sales_orders WHERE id = ?', 
        [id]
      );
      
      if (existingSO.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, error: 'Sales order not found' });
      }
      
      const salesOrder = existingSO[0];
      
      // Check if inventory has already been reduced (order status >= 2 means rider already assigned)
      if (salesOrder.my_status >= 2) {
        await connection.rollback();
        return res.status(400).json({ 
          success: false, 
          error: 'Inventory has already been reduced for this order' 
        });
      }
      
      // Get all items for this sales order
      const [orderItems] = await connection.query(
        `SELECT soi.product_id, soi.quantity, soi.unit_price, p.cost_price, p.product_name
         FROM sales_order_items soi
         JOIN products p ON soi.product_id = p.id
         WHERE soi.sales_order_id = ?`,
        [id]
      );
      
      if (orderItems.length === 0) {
        await connection.rollback();
        return res.status(400).json({ success: false, error: 'No items found for this order' });
      }
      
      // Always deduct from store 1 (default warehouse)
      const storeId = 1;
      
      // Verify sufficient inventory for all items
      for (const item of orderItems) {
        const [inventory] = await connection.query(
          'SELECT quantity FROM store_inventory WHERE store_id = ? AND product_id = ?',
          [storeId, item.product_id]
        );
        
        if (inventory.length === 0 || inventory[0].quantity < item.quantity) {
          await connection.rollback();
          return res.status(400).json({ 
            success: false, 
            error: `Insufficient inventory for product: ${item.product_name}. Available: ${inventory.length > 0 ? inventory[0].quantity : 0}, Required: ${item.quantity}` 
          });
        }
      }
      
      // Process inventory reduction for each item
      let totalCOGS = 0;
      
      for (const item of orderItems) {
        const { product_id, quantity, cost_price, product_name } = item;
        const unitCost = parseFloat(cost_price) || 0;
        const totalCost = unitCost * quantity;
        totalCOGS += totalCost;
        
        // Reduce inventory
        await connection.query(
          `UPDATE store_inventory 
           SET quantity = quantity - ?, 
               updated_at = CURRENT_TIMESTAMP 
           WHERE store_id = ? AND product_id = ?`,
          [quantity, storeId, product_id]
        );
        
        // Get the new balance after reduction
        const [currentInventory] = await connection.query(
          'SELECT quantity FROM store_inventory WHERE store_id = ? AND product_id = ?',
          [storeId, product_id]
        );
        const newBalance = currentInventory.length > 0 ? currentInventory[0].quantity : 0;
        
        // Record inventory transaction (outgoing)
        const reference = salesOrder.so_number || `SO-${id}`;
        await connection.query(
          `INSERT INTO inventory_transactions 
           (product_id, reference, amount_in, amount_out, unit_cost, total_cost, balance, date_received, store_id, staff_id)
           VALUES (?, ?, 0, ?, ?, ?, ?, NOW(), ?, ?)`,
          [product_id, reference, quantity, unitCost, totalCost, newBalance, storeId, req.user?.id || 1]
        );
        
        console.log(`✅ Inventory reduced for ${product_name}: -${quantity} units, New balance: ${newBalance}`);
      }
      
      // Create COGS journal entry
      if (totalCOGS > 0) {
        // Get required accounts
        const [costOfGoodsAccount] = await connection.query(
          "SELECT id FROM accounts WHERE code = '500000' LIMIT 1"
        );
        const [inventoryAccount] = await connection.query(
          "SELECT id FROM accounts WHERE code = '100001' LIMIT 1"
        );
        
        if (costOfGoodsAccount.length > 0 && inventoryAccount.length > 0) {
          const journalEntryNumber = `JE-DISP-${id}-${Date.now()}`;
          
          const [journalResult] = await connection.query(
            `INSERT INTO journal_entries (entry_number, entry_date, reference, description, total_debit, total_credit, status, created_by)
             VALUES (?, NOW(), ?, ?, ?, ?, 'posted', ?)`,
            [
              journalEntryNumber,
              salesOrder.so_number || `SO-${id}`,
              `Inventory dispatch for order ${salesOrder.so_number || id}`,
              totalCOGS,
              totalCOGS,
              req.user?.id || 1
            ]
          );
          
          const journalEntryId = journalResult.insertId;
          
          // Debit Cost of Goods Sold
          await connection.query(
            `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
             VALUES (?, ?, ?, 0, ?)`,
            [journalEntryId, costOfGoodsAccount[0].id, totalCOGS, `COGS - ${salesOrder.so_number || id}`]
          );
          
          // Credit Inventory
          await connection.query(
            `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
             VALUES (?, ?, 0, ?, ?)`,
            [journalEntryId, inventoryAccount[0].id, totalCOGS, `Inventory reduction - ${salesOrder.so_number || id}`]
          );
          
          console.log(`✅ COGS journal entry created: ${journalEntryNumber}, Total COGS: ${totalCOGS}`);
        } else {
          console.warn('⚠️ Required accounts not found for COGS journal entry (code: 500000 or 100001)');
        }
      }
      
      // Get the current user ID from the request
      const currentUserId = req.user?.id || 1;
      
      // Get current time in Nairobi timezone using Luxon
      const nairobiTime = DateTime.now().setZone('Africa/Nairobi');
      const nairobiTimestamp = nairobiTime.toFormat('yyyy-MM-dd HH:mm:ss');
      
      // Update the sales order with the rider ID, region ID, cylinder code ID, set my_status to 2, assigned_at to now, and dispatched_by to current user
      const now = new Date();
      await connection.query(
        'UPDATE sales_orders SET rider_id = ?, region_id = ?, cylinder_code_id = ?, my_status = 2, assigned_at = ?, dispatched_by = ? WHERE id = ?', 
        [riderId, regionId, cylinderCodeId, now, currentUserId, id]
      );
      
      // Update cylinder_codes table with current region, assignment date, and status (using Nairobi timezone)
      await connection.query(
        'UPDATE cylinder_codes SET current_region = ?, last_assigned_date = ?, status = ? WHERE id = ?',
        [regionId, nairobiTimestamp, 'AVAILABLE', cylinderCodeId]
      );
      
      // Log cylinder movement in ledger
      try {
        // Get additional details for the ledger
        const [orderDetails] = await connection.query(`
          SELECT 
            so.customer_id,
            so.so_number,
            c.name as customer_name,
            r.name as rider_name
          FROM sales_orders so
          LEFT JOIN Clients c ON so.customer_id = c.id
          LEFT JOIN Riders r ON so.rider_id = r.id
          WHERE so.id = ?
        `, [id]);
        
        const order = orderDetails[0];
        const performedByName = req.user?.full_name || req.user?.username || 'System';
        
        // Get previous region (if any) from cylinder_codes
        const [prevCylinder] = await connection.query(
          'SELECT current_region FROM cylinder_codes WHERE id = ?',
          [cylinderCodeId]
        );
        
        const fromRegionId = prevCylinder.length > 0 ? prevCylinder[0].current_region : null;
        
        await connection.query(`
          INSERT INTO cylinder_ledger (
            cylinder_code_id,
            transaction_type,
            sales_order_id,
            so_number,
            from_region_id,
            to_region_id,
            current_region_id,
            rider_id,
            rider_name,
            customer_id,
            customer_name,
            transaction_date,
            notes,
            performed_by,
            performed_by_name,
            status_before,
            status_after
          ) VALUES (?, 'ASSIGNED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REFILLED', 'AVAILABLE')
        `, [
          cylinderCodeId,
          id,
          order.so_number,
          fromRegionId,
          regionId,
          regionId,
          riderId,
          order.rider_name,
          order.customer_id,
          order.customer_name,
          nairobiTimestamp,
          `Cylinder assigned to order ${order.so_number} for delivery to ${order.customer_name}`,
          currentUserId,
          performedByName
        ]);
        
        console.log(`✅ Cylinder movement logged in ledger`);
      } catch (ledgerError) {
        console.error('⚠️ Warning: Could not log to cylinder_ledger:', ledgerError.message);
        // Don't fail the entire transaction if ledger logging fails
      }
      
      await connection.commit();
      console.log(`✅ Rider assigned successfully to order ${salesOrder.so_number || id}. Inventory reduced.`);
      
      res.json({ 
        success: true, 
        message: 'Rider assigned successfully and inventory reduced',
        totalCOGS: totalCOGS 
      });
      
    } catch (error) {
      await connection.rollback();
      console.error('Error assigning rider:', error);
      res.status(500).json({ success: false, error: 'Failed to assign rider: ' + error.message });
    } finally {
      connection.release();
    }
  },

  getSalesOrderItems: async (req, res) => {
    try {
      const { id } = req.params;
      const [items] = await db.query(`
        SELECT 
          soi.*, 
          p.product_name, 
          p.product_code, 
          p.unit_of_measure,
          p.cylinder_type
        FROM sales_order_items soi
        LEFT JOIN products p ON soi.product_id = p.id
        WHERE soi.sales_order_id = ?
      `, [id]);
      // Map product fields into a product object for each item
      const mappedItems = items.map(item => ({
        ...item,
        order_notes: item.order_notes,
        product: {
          id: item.product_id,
          product_name: item.product_name,
          product_code: item.product_code,
          unit_of_measure: item.unit_of_measure,
          cylinder_type: item.cylinder_type
        }
      }));
      res.json({ success: true, data: mappedItems });
    } catch (error) {
      console.error('Error fetching sales order items:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch sales order items' });
    }
  },

  // Receive items back to stock for a cancelled sales order
  receiveBackToStock: async (req, res) => {
    const { id } = req.params;
    try {
      // Check if the order exists and is cancelled
      const [orders] = await db.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
      if (!orders.length) {
        return res.status(404).json({ success: false, error: 'Sales order not found' });
      }
      const order = orders[0];
      if (order.my_status !== 4) {
        return res.status(400).json({ success: false, error: 'Order is not cancelled' });
      }
      // Get all items in the order
      const [items] = await db.query('SELECT product_id, quantity FROM sales_order_items WHERE sales_order_id = ?', [id]);
      if (!items.length) {
        return res.status(400).json({ success: false, error: 'No items found for this order' });
      }
      // Update product stock for each item
      for (const item of items) {
        await db.query('UPDATE products SET current_stock = current_stock + ? WHERE id = ?', [item.quantity, item.product_id]);
      }
      // Optionally, log the action or mark the order as returned
      await db.query('UPDATE sales_orders SET returned_to_stock = 1 WHERE id = ?', [id]);
      res.json({ success: true, message: 'Items received back to stock.' });
    } catch (error) {
      console.error('Error receiving items back to stock:', error);
      res.status(500).json({ success: false, error: 'Failed to receive items back to stock' });
    }
  },

  // Convert order to invoice
  convertToInvoice: async (req, res) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const { id } = req.params;
      const { expected_delivery_date, notes } = req.body;
      
      console.log('=== CONVERTING ORDER TO INVOICE ===');
      console.log('Order ID:', id);
      
      // Get the current user ID from the request
      const currentUserId = req.user?.id || 1;
      
      // Check if sales order exists and get current data
      const [existingSO] = await connection.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
      if (existingSO.length === 0) {
        return res.status(404).json({ success: false, error: 'Sales order not found' });
      }
      
      const originalOrder = existingSO[0];
      console.log('Original order status:', originalOrder.status);
      
      // Check if order is already confirmed
      if (originalOrder.status === 'confirmed') {
        return res.status(400).json({ success: false, error: 'Order is already confirmed/invoiced' });
      }
      
              // Get order items to calculate totals (unit_price stored tax-exclusive)
      const [items] = await connection.query(`
        SELECT product_id, quantity, unit_price, tax_type FROM sales_order_items WHERE sales_order_id = ?
      `, [id]);
      
      if (items.length === 0) {
        return res.status(400).json({ success: false, error: 'No items found in this order' });
      }
      
      // Calculate totals as tax-exclusive
      let subtotal = 0;
      let taxAmount = 0;
      let totalAmount = 0;
      for (const item of items) {
        const net = Number(item.quantity) * Number(item.unit_price);
        const rate = item.tax_type === '16%' ? 0.16 : 0;
        const itemTaxAmount = +(net * rate).toFixed(2);
        const itemTotal = +(net + itemTaxAmount).toFixed(2);
        subtotal += net;
        taxAmount += itemTaxAmount;
        totalAmount += itemTotal;
      }
      // Round totals
      subtotal = +subtotal.toFixed(2);
      taxAmount = +taxAmount.toFixed(2);
      totalAmount = +totalAmount.toFixed(2);
      
      // Update sales order to confirmed status and set my_status to 1
      await connection.query(`
        UPDATE sales_orders 
        SET status = 'confirmed',
            my_status = 1,
            expected_delivery_date = COALESCE(?, expected_delivery_date),
            notes = COALESCE(?, notes),
            subtotal = ?,
            tax_amount = ?,
            total_amount = ?,
            so_number = CONCAT('INV-', ?),
            updated_at = NOW()
        WHERE id = ?
      `, [expected_delivery_date, notes, subtotal, taxAmount, totalAmount, id, id]);
      
      console.log('Order updated to confirmed status');
      
      // Create journal entries for the invoice
      console.log('Creating journal entries for invoice conversion');
      
      // Get required accounts
      const [arAccount] = await connection.query(
        'SELECT id FROM chart_of_accounts WHERE id = ? AND is_active = 1',
        ['140'] // Accounts Receivable account ID
      );
      
      const [salesAccount] = await connection.query(
        'SELECT id FROM chart_of_accounts WHERE id = ? AND is_active = 1',
        ['53'] // Sales Revenue account ID
      );
      
      const [taxAccount] = await connection.query(
        'SELECT id FROM chart_of_accounts WHERE id = ? AND is_active = 1',
        ['35'] // Sales Tax Payable account ID
      );
      
      const [costOfGoodsAccount] = await connection.query(
        `SELECT id FROM chart_of_accounts WHERE account_code = '500000' LIMIT 1`
      );
      
      const [inventoryAccount] = await connection.query(
        `SELECT id FROM chart_of_accounts WHERE account_code = '100001' LIMIT 1`
      );
      
      if (arAccount.length && salesAccount.length) {
        console.log('Creating journal entry for invoice conversion');
        
        // Create journal entry
        const [journalResult] = await connection.query(
          `INSERT INTO journal_entries (entry_number, entry_date, reference, description, total_debit, total_credit, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, 'posted', ?)`,
          [
            `JE-INV-${id}-${Date.now()}`,
            originalOrder.order_date,
            `INV-${id}`,
            `Invoice created from order - ${originalOrder.so_number}`,
            totalAmount,
            totalAmount,
            currentUserId
          ]
        );
        const journalEntryId = journalResult.insertId;
        console.log('Journal entry created with ID:', journalEntryId);
        
        // Debit Accounts Receivable
        await connection.query(
          `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
           VALUES (?, ?, ?, 0, ?)`,
          [journalEntryId, arAccount[0].id, totalAmount, `Invoice INV-${id}`]
        );
        
        // Credit Sales Revenue
        await connection.query(
          `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
           VALUES (?, ?, 0, ?, ?)`,
          [journalEntryId, salesAccount[0].id, subtotal, `Sales revenue for invoice INV-${id}`]
        );
        
        // Credit Sales Tax Payable (if tax account exists and tax amount > 0)
        if (taxAccount.length > 0 && taxAmount > 0) {
          await connection.query(
            `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
             VALUES (?, ?, 0, ?, ?)`,
            [journalEntryId, taxAccount[0].id, taxAmount, `Sales tax for invoice INV-${id}`]
          );
        }
        
        // Update client ledger
        const [lastClientLedger] = await connection.query(
          'SELECT running_balance FROM client_ledger WHERE client_id = ? ORDER BY date DESC, id DESC LIMIT 1',
          [originalOrder.client_id]
        );
        
        const prevBalance = lastClientLedger.length > 0 ? parseFloat(lastClientLedger[0].running_balance) : 0;
        const newBalance = prevBalance + totalAmount; // Debit increases the receivable balance
        
        await connection.query(
          `INSERT INTO client_ledger (client_id, date, description, reference_type, reference_id, debit, credit, running_balance)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            originalOrder.client_id,
            originalOrder.order_date,
            `Invoice - INV-${id}`,
            'sales_order',
            id,
            totalAmount,
            0,
            newBalance
          ]
        );
        
        console.log('Journal entries and client ledger updated successfully for invoice');
        console.log('Client balance updated from', prevBalance, 'to', newBalance);
        
        // Update the Clients table balance column
        try {
          await connection.query(
            'UPDATE Clients SET balance = ? WHERE id = ?',
            [newBalance, originalOrder.client_id]
          );
          console.log('Clients table balance updated successfully');
        } catch (balanceError) {
          console.warn('Failed to update Clients table balance:', balanceError.message);
          // Continue with the transaction even if balance update fails
        }
      } else {
        console.error('Required accounts not found for journal entry creation');
        console.error('AR Account (ID: 140):', arAccount);
        console.error('Sales Account (ID: 53):', salesAccount);
        if (taxAccount.length === 0) {
          console.warn('Tax Account (ID: 35) not found - tax entries will be skipped');
        }
      }
      
      // Calculate total cost of goods sold and create COGS journal entry
      // NOTE: Skip COGS creation if inventory was already reduced when rider was assigned (my_status >= 2)
      let totalCOGS = 0;
      
      if (originalOrder.my_status < 2) {
        // Inventory hasn't been reduced yet, so we need to create COGS entry
        console.log('Order has not been dispatched yet (my_status < 2), calculating COGS for invoice conversion');
        
        for (const item of items) {
          // Get product cost price
          const [productResult] = await connection.query(
            'SELECT cost_price FROM products WHERE id = ?',
            [item.product_id]
          );
          if (productResult.length > 0) {
            const costPrice = parseFloat(productResult[0].cost_price);
            totalCOGS += item.quantity * costPrice;
          }
        }
        
        console.log('Total COGS calculated:', totalCOGS);
        
        // Create COGS journal entry if COGS > 0 and accounts exist
        if (totalCOGS > 0 && costOfGoodsAccount.length && inventoryAccount.length) {
          console.log('Creating COGS journal entry for non-dispatched order');
          
          const [cogsJournalResult] = await connection.query(
            `INSERT INTO journal_entries (entry_number, entry_date, reference, description, total_debit, total_credit, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, 'posted', ?)`,
            [
              `JE-COGS-${id}-${Date.now()}`,
              originalOrder.order_date,
              `INV-${id}`,
              `Cost of goods sold for invoice INV-${id}`,
              totalCOGS,
              totalCOGS,
              currentUserId
            ]
          );
          const cogsJournalEntryId = cogsJournalResult.insertId;
          console.log('COGS journal entry created with ID:', cogsJournalEntryId);
          
          // Debit Cost of Goods Sold
          await connection.query(
            `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
             VALUES (?, ?, ?, 0, ?)`,
            [cogsJournalEntryId, costOfGoodsAccount[0].id, totalCOGS, `COGS - Invoice INV-${id}`]
          );
          
          // Credit Inventory
          await connection.query(
            `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
             VALUES (?, ?, 0, ?, ?)`,
            [cogsJournalEntryId, inventoryAccount[0].id, totalCOGS, `Inventory reduction - Invoice INV-${id}`]
          );
          
          console.log('COGS journal entry created successfully');
        } else {
          if (totalCOGS === 0) {
            console.log('No COGS to record (total COGS = 0)');
          } else {
            console.error('Required COGS accounts not found for journal entry creation');
            console.error('COGS Account (code: 500000):', costOfGoodsAccount);
            console.error('Inventory Account (code: 100001):', inventoryAccount);
          }
        }
      } else {
        console.log('⏭️ Skipping COGS journal entry - inventory was already reduced when rider was assigned (my_status >= 2)');
      }
      
      await connection.commit();
      console.log('=== INVOICE CONVERSION SUCCESSFUL ===');
      console.log('Order ID:', id);
      console.log('Status updated to: confirmed');
      console.log('my_status set to: 1');
      
      res.json({ 
        success: true, 
        message: 'Order successfully converted to invoice with complete journal entries (including COGS)',
        orderId: id,
        status: 'confirmed',
        my_status: 1
      });
      
    } catch (error) {
      await connection.rollback();
      console.error('=== ERROR CONVERTING TO INVOICE ===');
      console.error('Error details:', error);
      console.error('Error message:', error.message);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to convert order to invoice',
        details: error.message 
      });
    } finally {
      connection.release();
    }
  },

  // Get delivery status with rider information
  getDeliveryStatus: async (req, res) => {
    try {
      const { id } = req.params;
      
      console.log('Fetching delivery status for order:', id);
      
      const [order] = await db.query(`
        SELECT 
          so.id,
          so.so_number,
          so.status as delivery_status,
          so.rider_id,
          r.name as rider_name,
          r.contact as rider_contact,
          so.assigned_at,
          so.customer_id,
          c.name as customer_name,
          c.phone as customer_phone,
          c.address as customer_address,
          so.order_date,
          so.expected_delivery_date,
          so.total_amount,
          so.my_status,
          so.created_at,
          so.updated_at
        FROM sales_orders so
        LEFT JOIN Riders r ON so.rider_id = r.id
        LEFT JOIN Clients c ON so.customer_id = c.id
        WHERE so.id = ?
      `, [id]);
      
      if (order.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Sales order not found' 
        });
      }
      
      res.json({ 
        success: true, 
        data: order[0] 
      });
      
    } catch (error) {
      console.error('Error fetching delivery status:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch delivery status' 
      });
    }
  },

  // Get delivery status for all orders (or filtered)
  getAllDeliveryStatus: async (req, res) => {
    try {
      const { status, rider_id, customer_id } = req.query;
      
      let whereClause = 'WHERE 1=1';
      let queryParams = [];
      
      // Filter by delivery status
      if (status) {
        const statusArray = status.split(',').map(s => s.trim());
        const placeholders = statusArray.map(() => '?').join(',');
        whereClause += ` AND so.status IN (${placeholders})`;
        queryParams.push(...statusArray);
      }
      
      // Filter by rider
      if (rider_id) {
        whereClause += ' AND so.rider_id = ?';
        queryParams.push(rider_id);
      }
      
      // Filter by customer
      if (customer_id) {
        whereClause += ' AND so.customer_id = ?';
        queryParams.push(customer_id);
      }
      
      console.log('Fetching delivery status with filters:', { status, rider_id, customer_id });
      
      const [orders] = await db.query(`
        SELECT 
          so.id,
          so.so_number,
          so.status as delivery_status,
          so.rider_id,
          r.name as rider_name,
          r.contact as rider_contact,
          so.assigned_at,
          so.customer_id,
          c.name as customer_name,
          c.phone as customer_phone,
          c.address as customer_address,
          so.order_date,
          so.expected_delivery_date,
          so.total_amount,
          so.my_status,
          so.created_at,
          so.updated_at
        FROM sales_orders so
        LEFT JOIN Riders r ON so.rider_id = r.id
        LEFT JOIN Clients c ON so.customer_id = c.id
        ${whereClause}
        ORDER BY so.created_at DESC
      `, queryParams);
      
      res.json({ 
        success: true, 
        data: orders,
        count: orders.length
      });
      
    } catch (error) {
      console.error('Error fetching delivery status:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch delivery status' 
      });
    }
  }
};

module.exports = salesOrderController; 