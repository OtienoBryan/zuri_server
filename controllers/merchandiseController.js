const db = require('../database/db');
const { validationResult } = require('express-validator');

// Get all merchandise categories
const getAllCategories = async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM merchandise_categories WHERE is_active = TRUE ORDER BY name'
    );
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching merchandise categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch merchandise categories'
    });
  }
};

// Get merchandise category by ID
const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [rows] = await db.execute(
      'SELECT * FROM merchandise_categories WHERE id = ? AND is_active = TRUE',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }
    
    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Error fetching merchandise category:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch merchandise category'
    });
  }
};

// Create new merchandise category
const createCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { name, description } = req.body;
    
    // Check if category name already exists
    const [existing] = await db.execute(
      'SELECT id FROM merchandise_categories WHERE name = ?',
      [name]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Category name already exists'
      });
    }
    
    const [result] = await db.execute(
      'INSERT INTO merchandise_categories (name, description) VALUES (?, ?)',
      [name, description]
    );
    
    const [newCategory] = await db.execute(
      'SELECT * FROM merchandise_categories WHERE id = ?',
      [result.insertId]
    );
    
    res.status(201).json({
      success: true,
      data: newCategory[0]
    });
  } catch (error) {
    console.error('Error creating merchandise category:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create merchandise category'
    });
  }
};

// Update merchandise category
const updateCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const { name, description } = req.body;
    
    // Check if category exists
    const [existing] = await db.execute(
      'SELECT id FROM merchandise_categories WHERE id = ? AND is_active = TRUE',
      [id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }
    
    // Check if new name conflicts with existing categories
    const [nameConflict] = await db.execute(
      'SELECT id FROM merchandise_categories WHERE name = ? AND id != ?',
      [name, id]
    );
    
    if (nameConflict.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Category name already exists'
      });
    }
    
    await db.execute(
      'UPDATE merchandise_categories SET name = ?, description = ? WHERE id = ?',
      [name, description, id]
    );
    
    res.json({
      success: true,
      message: 'Category updated successfully'
    });
  } catch (error) {
    console.error('Error updating merchandise category:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update merchandise category'
    });
  }
};

// Delete merchandise category (soft delete)
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if category is being used by any merchandise
    const [merchandise] = await db.execute(
      'SELECT COUNT(*) as count FROM merchandise WHERE category_id = ?',
      [id]
    );
    
    if (merchandise[0].count > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete category - it is being used by merchandise items'
      });
    }
    
    // Soft delete
    await db.execute(
      'UPDATE merchandise_categories SET is_active = FALSE WHERE id = ?',
      [id]
    );
    
    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting merchandise category:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete merchandise category'
    });
  }
};

// Get all merchandise with pagination and filtering
const getAllMerchandise = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', category_id } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE m.is_active = TRUE';
    let params = [];
    
    if (search) {
      whereClause += ' AND (m.name LIKE ? OR m.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    if (category_id && category_id !== 'all') {
      whereClause += ' AND m.category_id = ?';
      params.push(category_id);
    }
    
    // Get total count
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM merchandise m ${whereClause}`,
      params
    );
    
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);
    
    // Get merchandise with category names
    const [rows] = await db.execute(
      `SELECT m.*, mc.name as category_name 
       FROM merchandise m 
       LEFT JOIN merchandise_categories mc ON m.category_id = mc.id 
       ${whereClause} 
       ORDER BY m.name 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    
    res.json({
      success: true,
      data: rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching merchandise:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch merchandise'
    });
  }
};

// Get merchandise by ID
const getMerchandiseById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [rows] = await db.execute(
      `SELECT m.*, mc.name as category_name 
       FROM merchandise m 
       LEFT JOIN merchandise_categories mc ON m.category_id = mc.id 
       WHERE m.id = ? AND m.is_active = TRUE`,
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Merchandise not found'
      });
    }
    
    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Error fetching merchandise:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch merchandise'
    });
  }
};

// Create new merchandise
const createMerchandise = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { name, category_id, description } = req.body;
    
    // Validate category exists
    const [category] = await db.execute(
      'SELECT id FROM merchandise_categories WHERE id = ? AND is_active = TRUE',
      [category_id]
    );
    
    if (category.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid category'
      });
    }
    
    const [result] = await db.execute(
      'INSERT INTO merchandise (name, category_id, description) VALUES (?, ?, ?)',
      [name, category_id, description]
    );
    
    const [newMerchandise] = await db.execute(
      'SELECT * FROM merchandise WHERE id = ?',
      [result.insertId]
    );
    
    res.status(201).json({
      success: true,
      data: newMerchandise[0]
    });
  } catch (error) {
    console.error('Error creating merchandise:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create merchandise'
    });
  }
};

// Update merchandise
const updateMerchandise = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const { name, category_id, description } = req.body;
    
    // Check if merchandise exists
    const [existing] = await db.execute(
      'SELECT id FROM merchandise WHERE id = ? AND is_active = TRUE',
      [id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Merchandise not found'
      });
    }
    
    // Validate category exists
    const [category] = await db.execute(
      'SELECT id FROM merchandise_categories WHERE id = ? AND is_active = TRUE',
      [category_id]
    );
    
    if (category.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid category'
      });
    }
    
    await db.execute(
      'UPDATE merchandise SET name = ?, category_id = ?, description = ? WHERE id = ?',
      [name, category_id, description, id]
    );
    
    res.json({
      success: true,
      message: 'Merchandise updated successfully'
    });
  } catch (error) {
    console.error('Error updating merchandise:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update merchandise'
    });
  }
};

// Delete merchandise (soft delete)
const deleteMerchandise = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if merchandise exists
    const [existing] = await db.execute(
      'SELECT id FROM merchandise WHERE id = ? AND is_active = TRUE',
      [id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Merchandise not found'
      });
    }
    
    // Soft delete
    await db.execute(
      'UPDATE merchandise SET is_active = FALSE WHERE id = ?',
      [id]
    );
    
    res.json({
      success: true,
      message: 'Merchandise deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting merchandise:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete merchandise'
    });
  }
};

// Add merchandise stock
const addStock = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { merchandise_id, store_id, quantity, notes } = req.body;
    const received_by = req.user.id;
    
    // Check if merchandise exists
    const [merchandise] = await db.execute(
      'SELECT id FROM merchandise WHERE id = ? AND is_active = TRUE',
      [merchandise_id]
    );
    
    if (merchandise.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid merchandise ID'
      });
    }
    
    // Check if store exists
    const [store] = await db.execute(
      'SELECT id FROM stores WHERE id = ? AND is_active = TRUE',
      [store_id]
    );
    
    if (store.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid store ID'
      });
    }
    
    // Insert stock record
    const [result] = await db.execute(
      'INSERT INTO merchandise_stock (merchandise_id, store_id, quantity, received_by, notes) VALUES (?, ?, ?, ?, ?)',
      [merchandise_id, store_id, quantity, received_by, notes || null]
    );
    
    // Fetch the created stock record
    const [newStock] = await db.execute(
      'SELECT * FROM merchandise_stock WHERE id = ?',
      [result.insertId]
    );
    
    res.status(201).json({
      success: true,
      data: newStock[0]
    });
  } catch (error) {
    console.error('Error adding merchandise stock:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add merchandise stock'
    });
  }
};

// Get merchandise stock history
const getStockHistory = async (req, res) => {
  try {
    const { merchandise_id } = req.query;
    
    let whereClause = 'WHERE ms.is_active = TRUE';
    let params = [];
    
    if (merchandise_id) {
      whereClause += ' AND ms.merchandise_id = ?';
      params.push(merchandise_id);
    }
    
    // Get stock history with merchandise details
    const [rows] = await db.execute(
      `SELECT ms.*, m.name as merchandise_name, m.description as merchandise_description,
              mc.name as category_name, s.store_name, s.store_code
       FROM merchandise_stock ms 
       LEFT JOIN merchandise m ON ms.merchandise_id = m.id 
       LEFT JOIN merchandise_categories mc ON m.category_id = mc.id 
       LEFT JOIN stores s ON ms.store_id = s.id 
       ${whereClause} 
       ORDER BY ms.received_date DESC`,
      params
    );
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching merchandise stock history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch merchandise stock history'
    });
  }
};

// Add bulk merchandise stock
const addBulkStock = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { store_id, items, general_notes } = req.body;
    const received_by = req.user.id;
    
    // Check if store exists
    const [store] = await db.execute(
      'SELECT id FROM stores WHERE id = ? AND is_active = TRUE',
      [store_id]
    );
    
    if (store.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid store ID'
      });
    }

    // Validate all merchandise items exist
    const merchandiseIds = items.map(item => item.merchandise_id);
    const placeholders = merchandiseIds.map(() => '?').join(',');
    const [merchandise] = await db.execute(
      `SELECT id FROM merchandise WHERE id IN (${placeholders}) AND is_active = TRUE`,
      merchandiseIds
    );
    
    if (merchandise.length !== items.length) {
      return res.status(400).json({
        success: false,
        error: 'One or more merchandise items not found'
      });
    }

    const stockRecords = [];
    const ledgerRecords = [];
    
    // Process each item
    for (const item of items) {
      // Check if stock record already exists for this merchandise and store
      const [existingStock] = await db.execute(
        'SELECT id, quantity FROM merchandise_stock WHERE merchandise_id = ? AND store_id = ? AND is_active = TRUE',
        [item.merchandise_id, store_id]
      );

      let stockRecord;
      let newQuantity;

      if (existingStock.length > 0) {
        // Update existing stock record
        newQuantity = existingStock[0].quantity + item.quantity;
        await db.execute(
          'UPDATE merchandise_stock SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [newQuantity, existingStock[0].id]
        );
        
        // Fetch updated stock record
        const [updatedStock] = await db.execute(
          'SELECT * FROM merchandise_stock WHERE id = ?',
          [existingStock[0].id]
        );
        stockRecord = updatedStock[0];
      } else {
        // Create new stock record
        const [result] = await db.execute(
          'INSERT INTO merchandise_stock (merchandise_id, store_id, quantity, received_by, notes) VALUES (?, ?, ?, ?, ?)',
          [item.merchandise_id, store_id, item.quantity, received_by, item.notes || general_notes || null]
        );
        
        // Fetch the created stock record
        const [newStock] = await db.execute(
          'SELECT * FROM merchandise_stock WHERE id = ?',
          [result.insertId]
        );
        stockRecord = newStock[0];
        newQuantity = item.quantity;
      }

      // Create ledger entry
      const [ledgerResult] = await db.execute(
        'INSERT INTO merchandise_ledger (merchandise_id, store_id, transaction_type, quantity, balance_after, reference_id, reference_type, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          item.merchandise_id,
          store_id,
          'RECEIVE',
          item.quantity,
          newQuantity,
          stockRecord.id,
          'STOCK_RECEIPT',
          item.notes || general_notes || 'Stock received',
          received_by
        ]
      );

      // Fetch ledger entry
      const [ledgerEntry] = await db.execute(
        'SELECT * FROM merchandise_ledger WHERE id = ?',
        [ledgerResult.insertId]
      );

      stockRecords.push(stockRecord);
      ledgerRecords.push(ledgerEntry[0]);
    }
    
    res.status(201).json({
      success: true,
      data: {
        stock: stockRecords,
        ledger: ledgerRecords
      },
      message: `Successfully received ${items.length} merchandise items and updated inventory`
    });
  } catch (error) {
    console.error('Error adding bulk merchandise stock:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add bulk merchandise stock'
    });
  }
};

// Get current stock levels
const getCurrentStock = async (req, res) => {
  try {
    const { merchandise_id, store_id } = req.query;
    
    let whereClause = 'WHERE ms.is_active = TRUE';
    let params = [];
    
    if (merchandise_id) {
      whereClause += ' AND ms.merchandise_id = ?';
      params.push(merchandise_id);
    }
    
    if (store_id) {
      whereClause += ' AND ms.store_id = ?';
      params.push(store_id);
    }
    
    // Get current stock with merchandise and store details
    const [rows] = await db.execute(
      `SELECT ms.merchandise_id, ms.store_id, ms.quantity, 
              m.name as merchandise_name, s.store_name
       FROM merchandise_stock ms 
       LEFT JOIN merchandise m ON ms.merchandise_id = m.id 
       LEFT JOIN stores s ON ms.store_id = s.id 
       ${whereClause} 
       ORDER BY m.name, s.store_name`,
      params
    );
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching current stock:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch current stock'
    });
  }
};

// Get merchandise ledger
const getLedger = async (req, res) => {
  try {
    const { merchandise_id, store_id } = req.query;
    
    let whereClause = 'WHERE ml.id IS NOT NULL';
    let params = [];
    
    if (merchandise_id) {
      whereClause += ' AND ml.merchandise_id = ?';
      params.push(merchandise_id);
    }
    
    if (store_id) {
      whereClause += ' AND ml.store_id = ?';
      params.push(store_id);
    }
    
    // Get ledger with merchandise and store details
    const [rows] = await db.execute(
      `SELECT ml.*, m.name as merchandise_name, s.store_name
       FROM merchandise_ledger ml 
       LEFT JOIN merchandise m ON ml.merchandise_id = m.id 
       LEFT JOIN stores s ON ml.store_id = s.id 
       ${whereClause} 
       ORDER BY ml.created_at DESC`,
      params
    );
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching merchandise ledger:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch merchandise ledger'
    });
  }
};

// Get merchandise assignments
const getAssignments = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT ma.*, m.name as merchandise_name, s.name as staff_name, s.empl_no
       FROM merchandise_assignments ma 
       LEFT JOIN merchandise m ON ma.merchandise_id = m.id 
       LEFT JOIN staff s ON ma.staff_id = s.id 
       WHERE ma.is_active = TRUE 
       ORDER BY ma.date_assigned DESC`
    );
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching merchandise assignments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch merchandise assignments'
    });
  }
};

// Create merchandise assignment
const createAssignment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { merchandise_id, staff_id, quantity_assigned, date_assigned, comment } = req.body;
    
    // Check if merchandise exists
    const [merchandise] = await db.execute(
      'SELECT id FROM merchandise WHERE id = ? AND is_active = TRUE',
      [merchandise_id]
    );
    
    if (merchandise.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Merchandise not found'
      });
    }
    
    // Check if staff exists
    const [staff] = await db.execute(
      'SELECT id FROM staff WHERE id = ? AND status = 1',
      [staff_id]
    );
    
    if (staff.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Staff member not found or inactive'
      });
    }
    
    // Create assignment
    const [result] = await db.execute(
      'INSERT INTO merchandise_assignments (merchandise_id, staff_id, quantity_assigned, date_assigned, comment) VALUES (?, ?, ?, ?, ?)',
      [merchandise_id, staff_id, quantity_assigned, date_assigned, comment]
    );
    
    // Get the created assignment with details
    const [newAssignment] = await db.execute(
      `SELECT ma.*, m.name as merchandise_name, s.name as staff_name, s.empl_no
       FROM merchandise_assignments ma 
       LEFT JOIN merchandise m ON ma.merchandise_id = m.id 
       LEFT JOIN staff s ON ma.staff_id = s.id 
       WHERE ma.id = ?`,
      [result.insertId]
    );
    
    res.status(201).json({
      success: true,
      data: newAssignment[0]
    });
  } catch (error) {
    console.error('Error creating merchandise assignment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create merchandise assignment'
    });
  }
};

// Update merchandise assignment
const updateAssignment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const { merchandise_id, staff_id, quantity_assigned, date_assigned, comment } = req.body;
    
    // Check if assignment exists
    const [existing] = await db.execute(
      'SELECT id FROM merchandise_assignments WHERE id = ? AND is_active = TRUE',
      [id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found'
      });
    }
    
    // Update assignment
    await db.execute(
      'UPDATE merchandise_assignments SET merchandise_id = ?, staff_id = ?, quantity_assigned = ?, date_assigned = ?, comment = ? WHERE id = ?',
      [merchandise_id, staff_id, quantity_assigned, date_assigned, comment, id]
    );
    
    res.json({
      success: true,
      message: 'Assignment updated successfully'
    });
  } catch (error) {
    console.error('Error updating merchandise assignment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update merchandise assignment'
    });
  }
};

// Delete merchandise assignment
const deleteAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Soft delete by setting is_active to false
    const [result] = await db.execute(
      'UPDATE merchandise_assignments SET is_active = FALSE WHERE id = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Assignment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting merchandise assignment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete merchandise assignment'
    });
  }
};

module.exports = {
  // Category operations
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  
  // Merchandise operations
  getAllMerchandise,
  getMerchandiseById,
  createMerchandise,
  updateMerchandise,
  deleteMerchandise,
  
  // Stock operations
  addStock,
  addBulkStock,
  getStockHistory,
  getCurrentStock,
  getLedger,

  // Assignment operations
  getAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment
};
