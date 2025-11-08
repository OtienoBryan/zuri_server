const db = require('./db');

async function createFeedbackReportTable() {
  try {
    console.log('Creating feedback_report table...');
    
    // Check if table exists
    const [tables] = await db.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'feedback_report'
    `);
    
    if (tables.length > 0) {
      console.log('Table feedback_report already exists.');
      return;
    }
    
    // Create the table
    await db.query(`
      CREATE TABLE feedback_report (
        id INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
        appoint_id INT(11) NOT NULL,
        user_id INT(11) NOT NULL,
        name VARCHAR(100) NOT NULL,
        contact VARCHAR(50) NOT NULL,
        comment TEXT NOT NULL,
        date VARCHAR(50) NOT NULL,
        INDEX idx_appoint_id (appoint_id),
        INDEX idx_user_id (user_id),
        INDEX idx_date (date)
      )
    `);
    
    console.log('Table feedback_report created successfully!');
  } catch (err) {
    console.error('Error creating feedback_report table:', err);
    throw err;
  }
}

// Run if called directly
if (require.main === module) {
  createFeedbackReportTable()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Failed:', err);
      process.exit(1);
    });
}

module.exports = createFeedbackReportTable;

