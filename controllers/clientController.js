const db = require('../database/db');

const clientController = {
  // Get all clients
  getAllClients: async (req, res) => {
    try {
      console.log('[getAllClients] called with query:', req.query);
      // Pagination params
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const offset = (page - 1) * limit;
      
      // If limit is very high (like 10000), return all clients without pagination
      const getAllClients = limit >= 10000;
      const search = req.query.search ? String(req.query.search).trim() : '';
      const countryId = req.query.countryId ? String(req.query.countryId) : '';
      const regionId = req.query.regionId ? String(req.query.regionId) : '';
      const routeId = req.query.routeId ? String(req.query.routeId) : '';

      let where = '';
      let params = [];
      const whereClauses = [];
      if (search) {
        whereClauses.push('(c.name LIKE ? OR c.contact LIKE ? OR c.email LIKE ?)');
        const like = `%${search}%`;
        params.push(like, like, like);
      }
      if (countryId) {
        whereClauses.push('c.countryId = ?');
        params.push(countryId);
      }
      if (regionId) {
        whereClauses.push('c.region_id = ?');
        params.push(regionId);
      }
      if (routeId) {
        whereClauses.push('c.route_id = ?');
        params.push(routeId);
      }
      if (whereClauses.length > 0) {
        where = 'WHERE ' + whereClauses.join(' AND ');
      }

      // Get total count
      const [countRows] = await db.query(`SELECT COUNT(*) as count FROM Clients c ${where}`, params);
      const total = countRows[0].count;
      const totalPages = getAllClients ? 1 : Math.ceil(total / limit);

      // Get data (with or without pagination)
      let clients;
      if (getAllClients) {
        // Return all clients without pagination
        [clients] = await db.query(
          `SELECT c.*,
                  COALESCE(CAST(c.balance AS DECIMAL(15,2)), 0) AS balance,
                  oc.name as client_type_name,
                  oa.name as outlet_account_name,
                  co.name as country_name,
                  r.name as region_name,
                  rt.name as route_name
           FROM Clients c
           LEFT JOIN outlet_categories oc ON c.client_type = oc.id
           LEFT JOIN outlet_accounts oa ON c.outlet_account = oa.id
           LEFT JOIN Country co ON c.countryId = co.id
           LEFT JOIN Regions r ON c.region_id = r.id
           LEFT JOIN routes rt ON c.route_id_update = rt.id
           ${where} ORDER BY c.name ASC`,
          params
        );
        console.log(`[getAllClients] returning ALL ${clients.length} clients (no pagination)`);
      } else {
        // Return paginated data
        [clients] = await db.query(
          `SELECT c.*,
                  COALESCE(CAST(c.balance AS DECIMAL(15,2)), 0) AS balance,
                  oc.name as client_type_name,
                  oa.name as outlet_account_name,
                  co.name as country_name,
                  r.name as region_name,
                  rt.name as route_name
           FROM Clients c
           LEFT JOIN outlet_categories oc ON c.client_type = oc.id
           LEFT JOIN outlet_accounts oa ON c.outlet_account = oa.id
           LEFT JOIN Country co ON c.countryId = co.id
           LEFT JOIN Regions r ON c.region_id = r.id
           LEFT JOIN routes rt ON c.route_id_update = rt.id
           ${where} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        );
        console.log(`[getAllClients] returning ${clients.length} clients (page ${page})`);
      }
      
      // Debug logs for balances and payload when requested
      try {
        const debug = String(req.query.debug || '').trim();
        if (debug === '1') {
          const sample = Array.isArray(clients) ? clients.slice(0, 5) : [];
          const nullBalances = Array.isArray(clients) ? clients.filter((c) => c.balance === null || c.balance === undefined).length : 0;
          console.log(`[getAllClients][debug] sample (first 5):`, sample.map(c => ({ id: c.id, name: c.name, balance: c.balance })));
          console.log(`[getAllClients][debug] total clients: ${Array.isArray(clients) ? clients.length : 0}, null/undefined balances: ${nullBalances}`);
        }
      } catch (e) {
        console.warn('[getAllClients][debug] log failed:', e?.message);
      }

      res.json({
        data: clients,
        page: getAllClients ? 1 : page,
        limit: getAllClients ? total : limit,
        total,
        totalPages
      });
    } catch (error) {
      console.error('[getAllClients] error:', error);
      res.status(500).json({ message: 'Failed to fetch clients', error: error.message });
    }
  },

  // Get client by ID
  getClient: async (req, res) => {
    try {
      let { id } = req.params;
      console.log(`[getClient] called for id: ${id} (type: ${typeof id})`);
      if (isNaN(id)) {
        console.warn(`[getClient] Invalid id: ${id}`);
        return res.status(400).json({ message: 'Invalid client id' });
      }
      id = parseInt(id, 10);
      const tableName = 'Clients';
      console.log(`[getClient] Querying table: ${tableName}`);
      const sql = `SELECT * FROM ${tableName} WHERE id = ?`;
      console.log(`[getClient] SQL: ${sql}, params: [${id}]`);
      const [clients] = await db.query(sql, [id]);
      console.log(`[getClient] Query result:`, clients);
      if (!Array.isArray(clients)) {
        console.error(`[getClient] Query did not return an array!`);
      }
      if (clients.length === 0) {
        console.log(`[getClient] Client not found for id: ${id}`);
        return res.status(404).json({ message: 'Client not found' });
      }
      res.json(clients[0]);
    } catch (error) {
      console.error('[getClient] error:', error, error?.message);
      res.status(500).json({ message: 'Failed to fetch client details', error: error.message });
    }
  },

  // Create a new client
  createClient: async (req, res) => {
    try {
      const {
        name, address, email,
        region_id, route_id,
        contact, tax_pin, status,
        countryId, country_id, credit_limit, payment_terms,
        client_type, outlet_account
      } = req.body;
      
      if (!name || !email) {
        return res.status(400).json({ message: 'Required fields missing' });
      }
      
      // Handle both field name variations for compatibility
      const finalCountryId = countryId || country_id;
      
      // Build dynamic INSERT query based on available fields
      const fields = ['name', 'email'];
      const values = [name, email];
      
      if (address) { fields.push('address'); values.push(address); }
      if (region_id) { fields.push('region_id'); values.push(region_id); }
      if (route_id) { fields.push('route_id_update'); values.push(route_id); }
      if (contact) { fields.push('contact'); values.push(contact); }
      if (tax_pin) { fields.push('tax_pin'); values.push(tax_pin); }
      if (status !== undefined) { fields.push('status'); values.push(status || 0); }
      if (finalCountryId) { fields.push('countryId'); values.push(finalCountryId); }
      if (credit_limit) { fields.push('credit_limit'); values.push(credit_limit); }
      if (payment_terms) { fields.push('payment_terms'); values.push(payment_terms); }
      if (client_type) { fields.push('client_type'); values.push(client_type); }
      if (outlet_account) { fields.push('outlet_account'); values.push(outlet_account); }
      
      const placeholders = fields.map(() => '?').join(', ');
      const sql = `INSERT INTO Clients (${fields.join(', ')}) VALUES (${placeholders})`;
      
      console.log('Create client SQL:', sql);
      console.log('Create client values:', values);
      
      const [result] = await db.query(sql, values);
      const [newClient] = await db.query('SELECT * FROM Clients WHERE id = ?', [result.insertId]);
      res.status(201).json(newClient[0]);
    } catch (error) {
      console.error('Create client error:', error);
      res.status(500).json({ message: 'Failed to create client', error: error.message });
    }
  },

  // Update client
  updateClient: async (req, res) => {
    try {
      const { id } = req.params;
      console.log('[updateClient] Received request for client ID:', id);
      console.log('[updateClient] Request body:', JSON.stringify(req.body, null, 2));
      
      const {
        name, address, email,
        region_id, route_id, route_name,
        contact, tax_pin, status,
        countryId, country_id, credit_limit, payment_terms,
        client_type, outlet_account
      } = req.body;
      
      // Handle both field name variations for compatibility
      const finalCountryId = countryId || country_id;
      
      // Build dynamic UPDATE query based on available fields
      const updates = [];
      const values = [];
      
      if (name !== undefined) { updates.push('name = ?'); values.push(name); }
      if (email !== undefined) { updates.push('email = ?'); values.push(email); }
      if (address !== undefined) { updates.push('address = ?'); values.push(address); }
      if (region_id !== undefined) { updates.push('region_id = ?'); values.push(region_id); }
      if (route_id !== undefined) { updates.push('route_id_update = ?'); values.push(route_id); }
      if (route_name !== undefined) { updates.push('route_name_update = ?'); values.push(route_name); }
      if (contact !== undefined) { updates.push('contact = ?'); values.push(contact); }
      if (tax_pin !== undefined) { updates.push('tax_pin = ?'); values.push(tax_pin); }
      if (status !== undefined) { updates.push('status = ?'); values.push(status); }
      if (finalCountryId !== undefined) { updates.push('countryId = ?'); values.push(finalCountryId); }
      if (credit_limit !== undefined) { updates.push('credit_limit = ?'); values.push(credit_limit); }
      if (payment_terms !== undefined) { updates.push('payment_terms = ?'); values.push(payment_terms); }
      if (client_type !== undefined) { updates.push('client_type = ?'); values.push(client_type); }
      if (outlet_account !== undefined) { updates.push('outlet_account = ?'); values.push(outlet_account); }
      
      if (updates.length === 0) {
        return res.status(400).json({ message: 'No fields to update' });
      }
      
      values.push(id); // Add the WHERE clause parameter
      const sql = `UPDATE Clients SET ${updates.join(', ')} WHERE id = ?`;
      
      console.log('[updateClient] Fields to update:', updates);
      console.log('[updateClient] Update client SQL:', sql);
      console.log('[updateClient] Update client values:', values);
      
      await db.query(sql, values);
      const [updatedClient] = await db.query('SELECT * FROM Clients WHERE id = ?', [id]);
      res.json(updatedClient[0]);
    } catch (error) {
      console.error('Update client error:', error);
      res.status(500).json({ message: 'Failed to update client', error: error.message });
    }
  },

  // Delete client
  deleteClient: async (req, res) => {
    try {
      const { id } = req.params;
      await db.query('DELETE FROM Clients WHERE id = ?', [id]);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: 'Failed to delete client', error: error.message });
    }
  },

  // Get client activity (orders summary)
  getClientActivity: async (req, res) => {
    try {
      const { start_date, end_date, page = 1, limit = 20, search = '' } = req.query;
      const pageNum = parseInt(page, 10) || 1;
      const pageLimit = parseInt(limit, 10) || 20;
      let searchWhere = '';
      let searchParams = [];
      if (search) {
        searchWhere = `WHERE (name LIKE ? OR contact LIKE ? OR email LIKE ?)`;
        const like = `%${search}%`;
        searchParams = [like, like, like];
      }
      let dateFilter = '';
      let subqueryDateFilter = '';
      let params = [];
      let subqueryParams = [];
      if (start_date && end_date) {
        dateFilter = 'AND so.order_date BETWEEN ? AND ?';
        subqueryDateFilter = 'AND so2.order_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
        subqueryParams.push(start_date, end_date);
      } else if (start_date) {
        dateFilter = 'AND so.order_date >= ?';
        subqueryDateFilter = 'AND so2.order_date >= ?';
        params.push(start_date);
        subqueryParams.push(start_date);
      } else if (end_date) {
        dateFilter = 'AND so.order_date <= ?';
        subqueryDateFilter = 'AND so2.order_date <= ?';
        params.push(end_date);
        subqueryParams.push(end_date);
      }
      // Main query: get all clients, total orders, orders in period, last order date
      const [rows] = await db.query(`
        SELECT c.id, c.name,
          COUNT(so.id) AS total_orders,
          (
            SELECT COUNT(*) FROM sales_orders so2 WHERE so2.client_id = c.id ${subqueryDateFilter}
          ) AS orders_in_period,
          (
            SELECT MAX(so3.order_date) FROM sales_orders so3 WHERE so3.client_id = c.id
          ) AS last_order_date,
          (
            SELECT DATEDIFF(CURDATE(), MAX(so4.order_date)) FROM sales_orders so4 WHERE so4.client_id = c.id
          ) AS days_since_last_order,
          (
            CASE
              WHEN (
                (
                  SELECT COUNT(*) FROM sales_orders so2 WHERE so2.client_id = c.id ${subqueryDateFilter}
                ) > 0
              ) THEN 'Active'
              WHEN (COUNT(so.id) = 0) THEN 'Never Ordered'
              ELSE 'Inactive'
            END
          ) AS status
        FROM (
          SELECT * FROM Clients
          ${searchWhere}
        ) c
        LEFT JOIN sales_orders so ON so.client_id = c.id
        GROUP BY c.id, c.name
        ORDER BY
          CASE WHEN (
            SELECT MAX(so4.order_date) FROM sales_orders so4 WHERE so4.client_id = c.id
          ) IS NULL THEN 1 ELSE 0 END,
          days_since_last_order ASC
      `, [...searchParams, ...params, ...subqueryParams, ...subqueryParams]);
      const total = rows.length;
      const totalPages = Math.ceil(total / pageLimit);
      const paginatedRows = rows.slice((pageNum - 1) * pageLimit, pageNum * pageLimit);
      res.json({ success: true, data: paginatedRows, total, totalPages, page: pageNum, limit: pageLimit });
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch client activity', error: error.message });
    }
  },

  // Get client ledger/history
  getClientHistory: async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`[getClientHistory] called for client_id: ${id}`);
      const [rows] = await db.query(
        'SELECT * FROM client_ledger WHERE client_id = ? ORDER BY date DESC, id DESC',
        [id]
      );
      console.log(`[getClientHistory] returning ${rows.length} ledger entries for client_id: ${id}`);
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('[getClientHistory] error:', error);
      res.status(500).json({ message: 'Failed to fetch client history', error: error.message });
    }
  },

  // Get client payments (credit entries)
  getClientPayments: async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`[getClientPayments] called for client_id: ${id}`);
      const [rows] = await db.query(
        'SELECT * FROM client_ledger WHERE client_id = ? AND credit > 0 ORDER BY date DESC, id DESC',
        [id]
      );
      console.log(`[getClientPayments] returning ${rows.length} payment entries for client_id: ${id}`);
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('[getClientPayments] error:', error);
      res.status(500).json({ message: 'Failed to fetch client payments', error: error.message });
    }
  },

  // Get client invoices
  getClientInvoices: async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`[getClientInvoices] called for client_id: ${id}`);
      const [rows] = await db.query(
        'SELECT * FROM sales_orders WHERE client_id = ? ORDER BY order_date DESC, id DESC',
        [id]
      );
      console.log(`[getClientInvoices] returning ${rows.length} invoices for client_id: ${id}`);
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('[getClientInvoices] error:', error);
      res.status(500).json({ message: 'Failed to fetch client invoices', error: error.message });
    }
  },
};

// Get all client types
const getAllClientTypes = async (req, res) => {
  try {
    const [types] = await db.query('SELECT id, name FROM outlet_categories ORDER BY name');
    res.json(types);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch client types', error: error.message });
  }
};

// Get all outlet accounts
const getAllOutletAccounts = async (req, res) => {
  try {
    const [accounts] = await db.query('SELECT id, name FROM outlet_accounts ORDER BY name');
    res.json(accounts);
  } catch (error) {
    console.error('Error fetching outlet accounts:', error);
    res.status(500).json({ message: 'Failed to fetch outlet accounts', error: error.message });
  }
};

module.exports = { ...clientController, getAllClientTypes, getAllOutletAccounts }; 