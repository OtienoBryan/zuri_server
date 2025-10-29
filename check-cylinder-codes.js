const db = require('./database/db');

async function checkCylinderCodes() {
  try {
    console.log('Checking cylinder codes in database...\n');
    
    const [codes] = await db.query('SELECT id, code, current_region FROM cylinder_codes ORDER BY code');
    
    console.log(`✅ Found ${codes.length} cylinder codes in database:\n`);
    console.table(codes);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkCylinderCodes();

