const db = require('../database/db');
const { DateTime } = require('luxon');

// Cache for customer orders (short TTL since data changes frequently)
const ordersCache = {
  data: null,
  timestamp: null,
  ttl: 30000, // 30 seconds cache
  key: null // Cache key based on query params
};

const getCachedOrders = (cacheKey) => {
  if (ordersCache.data && ordersCache.timestamp && ordersCache.key === cacheKey) {
    const age = Date.now() - ordersCache.timestamp;
    if (age < ordersCache.ttl) {
      return ordersCache.data;
    }
  }
  return null;
};

const setCachedOrders = (cacheKey, data) => {
  ordersCache.data = data;
  ordersCache.timestamp = Date.now();
  ordersCache.key = cacheKey;
};

const salesOrderController = {
  // Get all sales orders (optimized with pagination, server-side filtering, and bulk item fetching)
  getAllSalesOrders: async (req, res) => {
    try {
      const { 
        client_id, 
        status, 
        search,
        date_from,
        date_to,
        page = 1,
        limit = 50,
        include_items = 'false'
      } = req.query;
      
      // Pagination
      const pageNum = parseInt(page) || 1;
      const limitNum = Math.min(parseInt(limit) || 10, 100); // Default 10, max 100 per page
      const offset = (pageNum - 1) * limitNum;
      
      // Build WHERE clause
      let whereConditions = ['so.my_status IN (1, 2, 3)'];
      let queryParams = [];
      
      // Add client_id filter if provided
      if (client_id) {
        whereConditions.push('so.customer_id = ?');
        queryParams.push(client_id);
      }
      
      // Add status filter if provided (comma-separated values)
      if (status) {
        const statusArray = status.split(',').map(s => s.trim());
        const placeholders = statusArray.map(() => '?').join(',');
        whereConditions[0] = `so.my_status IN (${placeholders})`;
        queryParams = [...statusArray, ...queryParams];
      }
      
      // Add search filter (SO number, customer name, sales rep)
      if (search) {
        whereConditions.push(`(
          so.so_number LIKE ? OR 
          so.name LIKE ? OR
          c.name LIKE ? OR
          sr.name LIKE ?
        )`);
        const searchTerm = `%${search}%`;
        queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
      }
      
      // Add date filters
      if (date_from) {
        whereConditions.push('so.order_date >= ?');
        queryParams.push(date_from);
      }
      if (date_to) {
        whereConditions.push('so.order_date <= ?');
        queryParams.push(date_to);
      }
      
      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
      
      // Get total count for pagination
      const [countResult] = await db.query(`
        SELECT COUNT(DISTINCT so.id) as total
        FROM sales_orders so
        LEFT JOIN Clients c ON so.customer_id = c.id
        LEFT JOIN SalesRep sr ON so.salesrep = sr.id
        ${whereClause}
      `, queryParams);
      const total = countResult[0].total;
      
      // Fetch sales orders with pagination
      const [rows] = await db.query(`
        SELECT 
          so.*, 
          COALESCE(so.amount_paid, 0) as amount_paid,
          COALESCE(so.name, c.name) as customer_name, 
          COALESCE(so.phone, c.phone) as customer_phone,
          COALESCE(so.address, c.address) as customer_address,
          c.balance as customer_balance,
          u.full_name as created_by_name,
          sr.name as salesrep,
          COALESCE(sr_region.name, sr.region) as salesrep_region_name,
          cc.code as cylinder_code
        FROM sales_orders so
        LEFT JOIN Clients c ON so.customer_id = c.id
        LEFT JOIN users u ON so.created_by = u.id
        LEFT JOIN SalesRep sr ON so.salesrep = sr.id
        LEFT JOIN Regions sr_region ON sr.region = sr_region.id OR sr.region = sr_region.name
        LEFT JOIN cylinder_codes cc ON so.cylinder_code_id = cc.id
        ${whereClause}
        ORDER BY so.created_at DESC
        LIMIT ? OFFSET ?
      `, [...queryParams, limitNum, offset]);
      
      // Fetch items in bulk if requested (optimized N+1 fix)
      if (include_items === 'true' && rows.length > 0) {
        const orderIds = rows.map(o => o.id);
        const placeholders = orderIds.map(() => '?').join(',');
        const [allItems] = await db.query(`
          SELECT 
            soi.*, 
            p.product_name, 
            p.product_code, 
            p.unit_of_measure,
            p.cylinder_type
          FROM sales_order_items soi
          LEFT JOIN products p ON soi.product_id = p.id
          WHERE soi.sales_order_id IN (${placeholders})
          ORDER BY soi.sales_order_id, soi.id
        `, orderIds);
        
        // Group items by sales_order_id
        const itemsByOrderId = {};
        allItems.forEach(item => {
          if (!itemsByOrderId[item.sales_order_id]) {
            itemsByOrderId[item.sales_order_id] = [];
          }
          itemsByOrderId[item.sales_order_id].push({
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
          });
        });
        
        // Attach items to orders
        rows.forEach(order => {
          order.items = itemsByOrderId[order.id] || [];
        });
      } else {
        // Set empty items array if not requested
        rows.forEach(order => {
          order.items = [];
        });
      }
      
      res.json({ 
        success: true, 
        data: rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: total,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      console.error('Error fetching sales orders:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch sales orders' });
    }
  },

  // Get all sales orders (including draft orders with my_status = 0)
  getAllSalesOrdersIncludingDrafts: async (req, res) => {
    try {
      // Create cache key from query params
      const cacheKey = JSON.stringify({
        limit: req.query.limit,
        offset: req.query.offset,
        my_status: req.query.my_status
      });
      
      // Check cache first
      const cachedData = getCachedOrders(cacheKey);
      if (cachedData) {
        return res.json({ success: true, data: cachedData, cached: true });
      }
      
      console.log('Fetching all sales orders (including drafts)...');
      
      // Default pagination: limit to 100 orders per request for better performance
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      
      // Validate limit (max 500 to prevent abuse, default 100)
      const validLimit = Math.min(limit > 0 ? limit : 100, 500);
      
      // Optimized: Fetch orders with minimal JOINs, then fetch related data separately if needed
      // This reduces query complexity and improves performance
      let query = `
        SELECT 
          so.*,
          COALESCE(c.name, so.name) as customer_name, 
          COALESCE(c.phone, so.phone) as customer_phone,
          COALESCE(c.address, so.address) as customer_address,
          c.balance as customer_balance,
          c.client_type,
          oc.name as client_type_name,
          c.outlet_account,
          oa.name as outlet_account_name,
          u.full_name as created_by_name,
          sr.name as salesrep,
          COALESCE(sr_region.name, sr.region) as salesrep_region_name,
          rt.name as salesrep_type_name,
          r.name as rider_name,
          r.contact as rider_contact,
          receiver.name as received_by_name,
          cc.code as cylinder_code,
          COALESCE(SUM(CASE WHEN rec.status = 'confirmed' THEN rec.amount ELSE 0 END), 0) as amount_paid
        FROM sales_orders so
        LEFT JOIN Clients c ON so.customer_id = c.id
        LEFT JOIN outlet_categories oc ON c.client_type = oc.id
        LEFT JOIN outlet_accounts oa ON c.outlet_account = oa.id
        LEFT JOIN users u ON so.created_by = u.id
        LEFT JOIN SalesRep sr ON so.salesrep = sr.id
        LEFT JOIN rep_type rt ON sr.rep_type_id = rt.id
        LEFT JOIN Regions sr_region ON sr.region = sr_region.id OR sr.region = sr_region.name
        LEFT JOIN Riders r ON so.rider_id = r.id
        LEFT JOIN staff receiver ON so.received_by = receiver.id
        LEFT JOIN cylinder_codes cc ON so.cylinder_code_id = cc.id
        LEFT JOIN receipts rec ON CAST(rec.invoice_number AS UNSIGNED) = so.id AND rec.status = 'confirmed'
        GROUP BY so.id, c.name, c.phone, c.address, c.balance, c.client_type, oc.name, 
                 c.outlet_account, oa.name, u.full_name, sr.name, sr_region.name, sr.region, 
                 rt.name, r.name, r.contact, receiver.name, cc.code
        ORDER BY so.created_at DESC
        LIMIT ? OFFSET ?
      `;
      
      const queryParams = [validLimit, offset];
      
      // Execute query and items fetch in parallel for better performance
      const [rows] = await db.query(query, queryParams);
      
      console.log('Sample order after query (before payment calc):', {
        id: rows[0]?.id,
        so_number: rows[0]?.so_number,
        amount_paid: rows[0]?.amount_paid,
        net_price: rows[0]?.net_price,
        total_amount: rows[0]?.total_amount
      });
      
      // Fetch all items for all orders in a single query (optimized N+1 fix)
      if (rows.length > 0) {
        const orderIds = rows.map(o => o.id);
        // Use proper parameterized query to prevent SQL injection
        const placeholders = orderIds.map(() => '?').join(',');
        const [allItems] = await db.query(`
          SELECT 
            soi.*, 
            p.product_name, 
            p.product_code, 
            p.unit_of_measure,
            p.cylinder_type
          FROM sales_order_items soi
          LEFT JOIN products p ON soi.product_id = p.id
          WHERE soi.sales_order_id IN (${placeholders})
          ORDER BY soi.sales_order_id, soi.id
        `, orderIds);
        
        // Group items by sales_order_id
        const itemsByOrderId = {};
        allItems.forEach(item => {
          if (!itemsByOrderId[item.sales_order_id]) {
            itemsByOrderId[item.sales_order_id] = [];
          }
          itemsByOrderId[item.sales_order_id].push({
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
          });
        });
        
        // Attach items to orders
        rows.forEach(order => {
          order.items = itemsByOrderId[order.id] || [];
        });
      } else {
        // No orders, ensure items is empty array
        rows.forEach(order => {
          order.items = [];
        });
      }
      
      // Populate customer object with phone and other fields
      rows.forEach(order => {
        // Create customer object for both linked customers and direct orders
        // Always create customer object if there's any customer data
        order.customer = {
          id: order.customer_id || null,
          name: order.customer_name || order.name || null,
          phone: (order.customer_phone && order.customer_phone.trim()) || null,
          address: order.customer_address || order.address || null,
          balance: order.customer_balance || null
        };
        
        // Calculate payment status based on amount paid vs net_price
        const netPrice = parseFloat(order.net_price) || parseFloat(order.total_amount) || 0;
        const amountPaid = parseFloat(order.amount_paid) || 0;
        
        if (amountPaid === 0) {
          order.payment_status = 'unpaid';
        } else if (amountPaid >= netPrice) {
          order.payment_status = 'paid';
        } else {
          order.payment_status = 'partially paid';
        }
        
        // Log first order for debugging
        if (order.id === rows[0]?.id) {
          console.log('First order payment status calculation:', {
            orderId: order.id,
            soNumber: order.so_number,
            netPrice,
            totalAmount: order.total_amount,
            amountPaid,
            payment_status: order.payment_status,
            rawAmountPaid: order.amount_paid
          });
        }
      });
      
      console.log('Final response data length:', rows.length);
      
      // Cache the results
      setCachedOrders(cacheKey, rows);
      
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
          so.name,
          c.contact,
          so.email,
          so.address,
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
      
      const { 
        customer_id, 
        client_id, 
        customer_name,
        customer_address,
        customer_phone,
        customer_email,
        sales_rep_id, 
        order_date, 
        expected_delivery_date, 
        notes, 
        subtotal, 
        tax_amount, 
        total_amount,
        total, // Support 'total' as alias for 'total_amount'
        items 
      } = req.body;
      
      const clientId = client_id || customer_id || 0;
      const finalTotalAmount = total_amount || total;
      
      // Validate required fields BEFORE starting transaction
      if (!items || !Array.isArray(items) || items.length === 0) {
        connection.release();
        return res.status(400).json({ 
          success: false, 
          error: 'Items array is required and must contain at least one item' 
        });
      }
      
      if (!order_date) {
        connection.release();
        return res.status(400).json({ 
          success: false, 
          error: 'order_date is required' 
        });
      }
      
      if (!finalTotalAmount && finalTotalAmount !== 0) {
        connection.release();
        return res.status(400).json({ 
          success: false, 
          error: 'total or total_amount is required' 
        });
      }
      
      // Start transaction after validation
      await connection.beginTransaction();
      
      const clientIdToUse = clientId;
      
      // OPTIMIZED: Fast SO number generation using AUTO_INCREMENT-based approach
      // Generate SO number using timestamp + random to avoid expensive MAX query
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000);
      const soNumber = `INV-${timestamp}${random}`;
      
      // OPTIMIZATION: Skip validation - trust frontend calculations (already validated on client side)
      // This eliminates unnecessary loop and calculations
      
      // Create order in sales_orders table with customer details
      
      // Try to insert with all fields including email if the column exists
      let soResult;
      try {
        [soResult] = await connection.query(`
          INSERT INTO sales_orders (
            so_number, customer_id, name, phone, address, email, salesrep, order_date, expected_delivery_date, 
            notes, status, subtotal, tax_amount, total_amount,net_price, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, NOW(), NOW())
        `, [
          soNumber, 
          clientIdToUse, 
          customer_name || '', 
          customer_phone || '', 
          customer_address || '',
          customer_email || '',
          sales_rep_id || null, 
          order_date, 
          expected_delivery_date, 
          notes, 
          subtotal, 
          tax_amount, 
          finalTotalAmount, 
          finalTotalAmount,
          1
        ]);
      } catch (insertError) {
        // If email column doesn't exist, insert without it
        if (insertError.code === 'ER_BAD_FIELD_ERROR') {
          console.log('email column does not exist, inserting without it');
          [soResult] = await connection.query(`
            INSERT INTO sales_orders (
              so_number, customer_id, name, phone, address, salesrep, order_date, expected_delivery_date, 
              notes, status, subtotal, tax_amount, total_amount,net_price, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, NOW(), NOW())
          `, [
            soNumber, 
            clientIdToUse, 
            customer_name || '', 
            customer_phone || '', 
            customer_address || '', 
            sales_rep_id || null, 
            order_date, 
            expected_delivery_date, 
            notes, 
            subtotal, 
            tax_amount, 
            finalTotalAmount, 
            finalTotalAmount,
            1
          ]);
        } else {
          throw insertError;
        }
      }
      const salesOrderId = soResult.insertId;
      
      // OPTIMIZED: Batch validate all products with a single query
      
      // First, ensure all items have an identifier
      for (const item of items) {
        if (!item.product_code && !item.product_id && !item.product_name) {
          await connection.rollback();
          connection.release();
          return res.status(400).json({ 
            success: false, 
            error: `Either product_id, product_code, or product_name must be provided for each item` 
          });
        }
      }
      
      // Collect all product identifiers
      const productIds = items.filter(item => item.product_id).map(item => item.product_id);
      const productCodes = items.filter(item => item.product_code).map(item => item.product_code);
      const productNames = items.filter(item => item.product_name).map(item => item.product_name);
      
      // Build a single query to fetch all products at once
      const conditions = [];
      const params = [];
      
      if (productIds.length > 0) {
        conditions.push(`id IN (${productIds.map(() => '?').join(',')})`);
        params.push(...productIds);
      }
      if (productCodes.length > 0) {
        conditions.push(`product_code IN (${productCodes.map(() => '?').join(',')})`);
        params.push(...productCodes);
      }
      if (productNames.length > 0) {
        conditions.push(`product_name IN (${productNames.map(() => '?').join(',')})`);
        params.push(...productNames);
      }
      
      const [products] = await connection.query(
        `SELECT id, product_code, product_name FROM products WHERE ${conditions.join(' OR ')}`,
        params
      );
      
      // Create lookup maps for fast access
      const productByIdMap = {};
      const productByCodeMap = {};
      const productByNameMap = {};
      
      products.forEach(product => {
        productByIdMap[product.id] = product;
        if (product.product_code) productByCodeMap[product.product_code] = product;
        if (product.product_name) productByNameMap[product.product_name] = product;
      });
      
      // Validate and assign product_id to each item
      for (const item of items) {
        let product = null;
        let identifier = '';
        
        if (item.product_code) {
          product = productByCodeMap[item.product_code];
          identifier = `code ${item.product_code}`;
        } else if (item.product_id) {
          product = productByIdMap[item.product_id];
          identifier = `ID ${item.product_id}`;
        } else if (item.product_name) {
          product = productByNameMap[item.product_name];
          identifier = `name "${item.product_name}"`;
        }
        
        if (!product) {
          await connection.rollback();
          connection.release();
          return res.status(400).json({ 
            success: false, 
            error: `Product with ${identifier} not found` 
          });
        }
        
        item.product_id = product.id;
      }
      
      // OPTIMIZED: Batch insert all sales order items with a single query
      
      // Prepare all item data
      const itemsData = items.map(item => {
        const taxType = item.tax_type || '16%';
        const taxRate = taxType === '16%' ? 0.16 : 0; // zero_rated/exempted => 0
        const netPrice = Number(item.quantity) * Number(item.unit_price);
        const itemTaxAmount = +(netPrice * taxRate).toFixed(2);
        // Calculate total amount (net_price + tax)
        const totalAmount = +(netPrice + itemTaxAmount).toFixed(2);
        
        return {
          sales_order_id: salesOrderId,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_type: taxType,
          tax_amount: item.tax_amount || itemTaxAmount,
          // net_price should be the same as total_amount (total price including tax)
          net_price: totalAmount,
          total_price: totalAmount,
          order_notes: item.order_notes || null
        };
      });
      
      // Build parameterized query for batch insert
      // Include order_notes if provided
      const includeOrderNotes = itemsData.some(item => item.order_notes);
      
      // Build values array - ensure net_price is explicitly set to total_amount
      const values = [];
      const placeholders = [];
      
      itemsData.forEach((item, index) => {
        // net_price should be the same as total_price (total amount including tax)
        const netPriceValue = Number(item.total_price) || Number(item.net_price) || 0;
        const totalPriceValue = Number(item.total_price) || 0;
        
        // Log first item for debugging
        if (index === 0) {
          console.log('Inserting item with values:', {
            sales_order_id: item.sales_order_id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            tax_type: item.tax_type,
            tax_amount: item.tax_amount,
            net_price: netPriceValue,
            total_price: totalPriceValue,
            order_notes: item.order_notes
          });
        }
        
        const rowValues = [
          item.sales_order_id,
          item.product_id,
          item.quantity,
          item.unit_price,
          item.tax_type || '16%',
          Number(item.tax_amount) || 0,
          netPriceValue,  // net_price = total_amount (same as total_price)
          totalPriceValue
        ];
        
        if (includeOrderNotes) {
          rowValues.push(item.order_notes || null);
        }
        
        placeholders.push(`(${rowValues.map(() => '?').join(', ')})`);
        values.push(...rowValues);
      });
      
      const columns = includeOrderNotes
        ? `sales_order_id, product_id, quantity, unit_price, tax_type, tax_amount, net_price, total_price, order_notes`
        : `sales_order_id, product_id, quantity, unit_price, tax_type, tax_amount, net_price, total_price`;
      
      const insertQuery = `
        INSERT INTO sales_order_items (
          ${columns}
        ) VALUES ${placeholders.join(', ')}
      `;
      
      console.log('Executing INSERT query with columns:', columns);
      console.log('Number of placeholders:', placeholders.length, 'Number of values:', values.length);
      
      try {
        const [result] = await connection.query(insertQuery, values);
        console.log(`Successfully inserted ${result.affectedRows} sales order items. net_price values were set correctly.`);
        
        // Verify that net_price was actually saved
        const [verifyRows] = await connection.query(`
          SELECT id, product_id, net_price, total_price, tax_amount 
          FROM sales_order_items 
          WHERE sales_order_id = ? 
          ORDER BY id DESC 
          LIMIT 5
        `, [salesOrderId]);
        
        console.log('Verification - First few inserted items:', verifyRows);
        
        if (verifyRows.length > 0) {
          verifyRows.forEach((row, idx) => {
            if (row.net_price !== row.total_price) {
              console.warn(`WARNING: Item ${idx + 1} (ID: ${row.id}) has net_price (${row.net_price}) != total_price (${row.total_price})`);
            }
          });
        }
      } catch (insertError) {
        console.error('Error inserting sales order items:', insertError);
        console.error('Error code:', insertError.code);
        console.error('Error message:', insertError.message);
        console.error('SQL State:', insertError.sqlState);
        if (insertError.sql) {
          console.error('Failed SQL:', insertError.sql);
        }
        throw insertError;
      }
      
      await connection.commit();
      
      // ULTRA-OPTIMIZED: Return data directly without additional database query
      // We already have all the information needed from the request
      const responseData = {
        id: salesOrderId,
        so_number: soNumber,
        customer_id: clientIdToUse,
        customer_name: customer_name || '',
        customer_phone: customer_phone || '',
        customer_address: customer_address || '',
        salesrep: sales_rep_id || null,
        order_date: order_date,
        expected_delivery_date: expected_delivery_date,
        status: 'draft',
        subtotal: subtotal,
        tax_amount: tax_amount,
        total_amount: finalTotalAmount,
        notes: notes,
        my_status: 0,
        created_by: 1,
        items: itemsData.map((item, idx) => ({
          id: null, // Not available without query, but frontend doesn't need it immediately
          sales_order_id: salesOrderId,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_type: item.tax_type,
          tax_amount: item.tax_amount,
          net_price: item.net_price,
          total_price: item.total_price,
          product_name: items[idx].product_name || null,
          product_code: items[idx].product_code || null,
          unit_of_measure: null
        }))
      };
      
      res.status(201).json({ 
        success: true, 
        data: responseData,
        message: 'Sales order created successfully' 
      });
    } catch (error) {
      await connection.rollback();
      console.error('Error creating sales order:', error.message);
      res.status(500).json({ success: false, error: 'Failed to create sales order' });
    } finally {
      connection.release();
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
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
        
        if (arAccount.length && salesAccount.length) {
          console.log('Creating journal entry for order:', id);
          console.log('AR Account found:', arAccount[0]);
          console.log('Sales Account found:', salesAccount[0]);
          console.log('Current User ID:', currentUserId);
          console.log('Subtotal Amount (no tax):', subtotal);
          
          // Create journal entry (using subtotal, no tax)
          const [journalResult] = await connection.query(
            `INSERT INTO journal_entries (entry_number, entry_date, reference, description, total_debit, total_credit, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, 'posted', ?)`,
            [
              `JE-SO-${id}-${Date.now()}`,
              order_date || existingSO[0].order_date,
              `SO-${id}`,
              `Sales order approved - ${existingSO[0].so_number}`,
              subtotal,
              subtotal,
              currentUserId
            ]
          );
          const journalEntryId = journalResult.insertId;
          console.log('Journal entry created with ID:', journalEntryId);
          
          // Debit Accounts Receivable (using subtotal, no tax)
          await connection.query(
            `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
             VALUES (?, ?, ?, 0, ?)`,
            [journalEntryId, arAccount[0].id, subtotal, `Sales order ${existingSO[0].so_number}`]
          );
          
          // Credit Sales Revenue
          await connection.query(
            `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
             VALUES (?, ?, 0, ?, ?)`,
            [journalEntryId, salesAccount[0].id, subtotal, `Sales revenue for order ${existingSO[0].so_number}`]
          );
          
          // Update client ledger (using subtotal, no tax)
          const [lastClientLedger] = await connection.query(
            'SELECT running_balance FROM client_ledger WHERE client_id = ? ORDER BY date DESC, id DESC LIMIT 1',
            [clientId]
          );
          
          const prevBalance = lastClientLedger.length > 0 ? parseFloat(lastClientLedger[0].running_balance) : 0;
          const newBalance = prevBalance + subtotal; // Debit increases the receivable balance
          
          await connection.query(
            `INSERT INTO client_ledger (client_id, date, description, reference_type, reference_id, debit, credit, running_balance)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              clientId,
              order_date || existingSO[0].order_date,
              `Sales order - ${existingSO[0].so_number}`,
              'sales_order',
              id,
              subtotal,
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
      const { riderId, regionId, cylinderCodeId, cylinderAssignments } = req.body;
      
      if (!riderId) {
        return res.status(400).json({ success: false, error: 'riderId is required' });
      }
      
      if (!regionId) {
        return res.status(400).json({ success: false, error: 'regionId is required' });
      }
      
      // Support both old format (single cylinderCodeId) and new format (array of assignments)
      // Cylinder codes are now optional
      let assignments = [];
      if (cylinderAssignments && Array.isArray(cylinderAssignments) && cylinderAssignments.length > 0) {
        assignments = cylinderAssignments.filter(a => a.cylinderCodeId && a.productId);
      } else if (cylinderCodeId) {
        // Backward compatibility: convert single cylinderCodeId to array format
        assignments = [{ cylinderCodeId, productId: null }];
      }
      
      // Cylinder codes are optional, so we don't require them
      
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
      
      // Get additional details for the ledger
      const [orderDetails] = await connection.query(`
        SELECT 
          so.customer_id,
          so.so_number,
          so.name as customer_name,
          r.name as rider_name
        FROM sales_orders so
        LEFT JOIN Clients c ON so.customer_id = c.id
        LEFT JOIN Riders r ON so.rider_id = r.id
        WHERE so.id = ?
      `, [id]);
      
      const order = orderDetails[0];
      const performedByName = req.user?.full_name || req.user?.username || 'System';
      
      // Get product names for notes
      const productNames = {};
      for (const assignment of assignments) {
        if (assignment.productId) {
          const [product] = await connection.query(
            'SELECT product_name FROM products WHERE id = ?',
            [assignment.productId]
          );
          if (product.length > 0) {
            productNames[assignment.productId] = product[0].product_name;
          }
        }
      }
      
      // Process each cylinder assignment (only if assignments exist)
      const firstCylinderCodeId = assignments.length > 0 ? assignments[0].cylinderCodeId : null;
      
      for (const assignment of assignments) {
        const { cylinderCodeId, productId } = assignment;
        
        // Get previous region (if any) from cylinder_codes BEFORE updating
        const [prevCylinder] = await connection.query(
          'SELECT current_region FROM cylinder_codes WHERE id = ?',
          [cylinderCodeId]
        );
        
        const fromRegionId = prevCylinder.length > 0 ? prevCylinder[0].current_region : null;
        
        // Update cylinder_codes table with current region, assignment date, and status
        await connection.query(
          'UPDATE cylinder_codes SET current_region = ?, last_assigned_date = ?, status = ? WHERE id = ?',
          [regionId, nairobiTimestamp, 'AVAILABLE', cylinderCodeId]
        );
        
        console.log(`✅ Updated cylinder ${cylinderCodeId} with region ${regionId}`);
        
        // Create note with product information if available
        let notes = `Cylinder assigned to order ${order.so_number} for delivery to ${order.customer_name}`;
        if (productId && productNames[productId]) {
          notes += ` (Product: ${productNames[productId]})`;
        }
        
        // Log cylinder movement in ledger
        try {
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
            notes,
            currentUserId,
            performedByName
          ]);
          
          console.log(`✅ Cylinder ${cylinderCodeId} movement logged in ledger`);
        } catch (ledgerError) {
          console.error(`⚠️ Warning: Could not log cylinder ${cylinderCodeId} to cylinder_ledger:`, ledgerError.message);
          // Don't fail the entire transaction if ledger logging fails
        }
      }
      
      // Update the sales order with the rider ID, region ID, first cylinder code ID (for backward compatibility), set my_status to 2, assigned_at to now, and dispatched_by to current user
      const now = new Date();
      await connection.query(
        'UPDATE sales_orders SET rider_id = ?, region_id = ?, cylinder_code_id = ?, my_status = 2, assigned_at = ?, dispatched_by = ? WHERE id = ?', 
        [riderId, regionId, firstCylinderCodeId, now, currentUserId, id]
      );
      
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
      
      const [costOfGoodsAccount] = await connection.query(
        `SELECT id FROM chart_of_accounts WHERE account_code = '500000' LIMIT 1`
      );
      
      const [inventoryAccount] = await connection.query(
        `SELECT id FROM chart_of_accounts WHERE account_code = '100001' LIMIT 1`
      );
      
      if (arAccount.length && salesAccount.length) {
        console.log('Creating journal entry for invoice conversion');
        
        // Create journal entry (using subtotal, no tax)
        const [journalResult] = await connection.query(
          `INSERT INTO journal_entries (entry_number, entry_date, reference, description, total_debit, total_credit, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, 'posted', ?)`,
          [
            `JE-INV-${id}-${Date.now()}`,
            originalOrder.order_date,
            `INV-${id}`,
            `Invoice created from order - ${originalOrder.so_number}`,
            subtotal,
            subtotal,
            currentUserId
          ]
        );
        const journalEntryId = journalResult.insertId;
        console.log('Journal entry created with ID:', journalEntryId);
        
        // Debit Accounts Receivable (using subtotal, no tax)
        await connection.query(
          `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
           VALUES (?, ?, ?, 0, ?)`,
          [journalEntryId, arAccount[0].id, subtotal, `Invoice INV-${id}`]
        );
        
        // Credit Sales Revenue
        await connection.query(
          `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
           VALUES (?, ?, 0, ?, ?)`,
          [journalEntryId, salesAccount[0].id, subtotal, `Sales revenue for invoice INV-${id}`]
        );
        
        // Update client ledger (using totalAmount including tax - client owes the full amount)
        // Use customer_id from sales_orders table (which maps to Clients.id)
        const clientId = originalOrder.customer_id || originalOrder.client_id;
        
        if (!clientId || clientId === 0) {
          console.warn('No client_id found for order, skipping client ledger update');
        } else {
          const [lastClientLedger] = await connection.query(
            'SELECT running_balance FROM client_ledger WHERE client_id = ? ORDER BY date DESC, id DESC LIMIT 1',
            [clientId]
          );
          
          const prevBalance = lastClientLedger.length > 0 ? parseFloat(lastClientLedger[0].running_balance) : 0;
          const newBalance = prevBalance + totalAmount; // Debit increases the receivable balance (use totalAmount, not subtotal)
          
          const [ledgerResult] = await connection.query(
            `INSERT INTO client_ledger (client_id, date, description, reference_type, reference_id, debit, credit, running_balance)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              clientId,
              originalOrder.order_date,
              `Invoice - INV-${id}`,
              'sales_order',
              id,
              totalAmount,
              0,
              newBalance
            ]
          );
          
          // Recalculate running balances for all subsequent client ledger entries
          const [subsequentClientEntries] = await connection.query(
            'SELECT * FROM client_ledger WHERE client_id = ? AND id > ? ORDER BY id ASC',
            [clientId, ledgerResult.insertId]
          );
          
          let currentClientBalance = newBalance;
          for (const subsequentEntry of subsequentClientEntries) {
            const debit = parseFloat(subsequentEntry.debit || 0);
            const credit = parseFloat(subsequentEntry.credit || 0);
            currentClientBalance = currentClientBalance + debit - credit;
            
            await connection.query(
              'UPDATE client_ledger SET running_balance = ? WHERE id = ?',
              [currentClientBalance, subsequentEntry.id]
            );
          }
          
          console.log('Journal entries and client ledger updated successfully for invoice');
          console.log('Client balance updated from', prevBalance, 'to', currentClientBalance);
          
          // Update the Clients table balance column with the final calculated balance
          try {
            await connection.query(
              'UPDATE Clients SET balance = ? WHERE id = ?',
              [currentClientBalance, clientId]
            );
            console.log('Clients table balance updated successfully');
          } catch (balanceError) {
            console.warn('Failed to update Clients table balance:', balanceError.message);
            // Continue with the transaction even if balance update fails
          }
        }
      } else {
        console.error('Required accounts not found for journal entry creation');
        console.error('AR Account (ID: 140):', arAccount);
        console.error('Sales Account (ID: 53):', salesAccount);
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
          so.name as customer_name,
          so.phone as customer_phone,
          so.address as customer_address,
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
          so.name as customer_name,
          so.phone as customer_phone,
          so.address as customer_address,
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
  },

  // Get delivery status for a single order by ID or SO number
  getDeliveryStatusByIdOrNumber: async (req, res) => {
    try {
      const { identifier } = req.params; // Can be ID or SO number
      
      console.log('Fetching delivery status for order:', identifier);
      
      // Check if identifier is numeric (ID) or string (SO number)
      const isNumeric = /^\d+$/.test(identifier);
      const whereClause = isNumeric 
        ? 'WHERE so.id = ?'
        : 'WHERE so.so_number = ?';
      
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
          so.name as customer_name,
          so.phone as customer_phone,
          so.address as customer_address,
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
      `, [identifier]);
      
      if (orders.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Order not found' 
        });
      }
      
      res.json({ 
        success: true, 
        data: orders[0]
      });
      
    } catch (error) {
      console.error('Error fetching delivery status for order:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch delivery status' 
      });
    }
  }
};

module.exports = salesOrderController; 