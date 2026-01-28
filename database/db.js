const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'retail_finance',
  waitForConnections: true,
  connectionLimit: 10, // Increased for better concurrency
  queueLimit: 0,
  acquireTimeout: 30000, // 30 seconds (reduced from 60)
  timeout: 30000, // 30 seconds query timeout (reduced from 60)
  reconnect: true,
  ssl: false, // Temporarily disable SSL to test connection
  timezone: '+00:00', // Force UTC timezone
  dateStrings: true, // Return dates as strings to avoid timezone conversion
  enableKeepAlive: true, // Keep connections alive
  keepAliveInitialDelay: 0
});

// Test database connection and set timezone
pool.getConnection(async (err, connection) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    return;
  }
  
  try {
    // Set timezone to UTC to ensure consistent time handling
    await connection.query("SET time_zone = '+00:00'");
    console.log('Successfully connected to MySQL database and set timezone to UTC');
  } catch (timezoneErr) {
    console.warn('Warning: Could not set timezone to UTC:', timezoneErr.message);
  }
  
  connection.release();
});

module.exports = pool.promise(); 