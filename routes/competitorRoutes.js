const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET /api/competitors - fetch all competitors
router.get('/', async (req, res) => {
  console.log('GET /api/competitors called');
  try {
    const sql = `
      SELECT 
        c.id,
        c.outlet,
        c.outlet_id,
        c.merchandiser,
        c.competing_product,
        c.mechanism,
        c.zuri_product,
        c.date,
        l.name as outlet_name,
        sr.name as merchandiser_name
      FROM \`competitior\` c
      LEFT JOIN locations l ON c.outlet_id = l.id
      LEFT JOIN SalesRep sr ON c.merchandiser = sr.id
      ORDER BY c.id DESC
    `;
    
    console.log('SQL Query:', sql);
    const [rows] = await db.query(sql);
    console.log('Competitors fetched:', rows.length);
    
    // Debug: Log sample of data to verify outlet_name and merchandiser_name are being fetched
    if (rows.length > 0) {
      console.log('Sample competitor data:', JSON.stringify(rows[0], null, 2));
      console.log('First competitor outlet_id:', rows[0].outlet_id);
      console.log('First competitor outlet_name:', rows[0].outlet_name);
      console.log('First competitor merchandiser:', rows[0].merchandiser);
      console.log('First competitor merchandiser_name:', rows[0].merchandiser_name);
    }
    
    res.json({ success: true, data: rows || [] });
  } catch (error) {
    console.error('Error fetching competitors:', error);
    console.error('Error code:', error.code);
    console.error('Error sqlMessage:', error.sqlMessage);
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch competitors', 
      details: error.message || 'Unknown error',
      code: error.code,
      sqlMessage: error.sqlMessage
    });
  }
});

// GET /api/competitors/:id - fetch single competitor
router.get('/:id', async (req, res) => {
  console.log('GET /api/competitors/:id called', req.params.id);
  const { id } = req.params;
  try {
    const sql = `
      SELECT 
        c.*,
        l.name as outlet_name,
        sr.name as merchandiser_name
      FROM \`competitior\` c
      LEFT JOIN locations l ON c.outlet_id = l.id
      LEFT JOIN SalesRep sr ON c.merchandiser = sr.id
      WHERE c.id = ?
    `;
    const [rows] = await db.query(sql, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Competitor not found' 
      });
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error fetching competitor:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch competitor', 
      details: error.message || error 
    });
  }
});

module.exports = router;

