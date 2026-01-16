const db = require('./database/db');

async function checkMerchandiseData() {
  let connection;
  try {
    console.log('🔍 Checking merchandise data...\n');
    
    connection = await db.getConnection();
    
    // Check if merchandise table exists
    const [tables] = await connection.query("SHOW TABLES LIKE 'merchandise'");
    if (tables.length === 0) {
      console.log('❌ merchandise table does not exist!');
      return;
    }
    console.log('✅ merchandise table exists\n');
    
    // Check merchandise categories
    const [categories] = await connection.query('SELECT * FROM merchandise_categories WHERE is_active = TRUE');
    console.log(`📦 Categories: ${categories.length} active categories`);
    categories.forEach(cat => {
      console.log(`   - ID: ${cat.id}, Name: ${cat.name}, Active: ${cat.is_active}`);
    });
    console.log('');
    
    // Check all merchandise (including inactive)
    const [allMerchandise] = await connection.query('SELECT * FROM merchandise ORDER BY id');
    console.log(`📦 All Merchandise: ${allMerchandise.length} items`);
    allMerchandise.forEach(item => {
      console.log(`   - ID: ${item.id}, Name: ${item.name}, Category: ${item.category_id}, Active: ${item.is_active}`);
    });
    console.log('');
    
    // Check active merchandise only
    const [activeMerchandise] = await connection.query('SELECT * FROM merchandise WHERE is_active = TRUE ORDER BY id');
    console.log(`✅ Active Merchandise: ${activeMerchandise.length} items`);
    activeMerchandise.forEach(item => {
      console.log(`   - ID: ${item.id}, Name: ${item.name}, Category: ${item.category_id}`);
    });
    console.log('');
    
    // Check merchandise with different is_active values
    const [activeCheck] = await connection.query('SELECT id, name, is_active, is_active = 1 as is_active_check FROM merchandise LIMIT 5');
    console.log('🔍 Sample is_active values:');
    activeCheck.forEach(item => {
      console.log(`   - ID: ${item.id}, Name: ${item.name}, is_active: ${item.is_active} (type: ${typeof item.is_active}), equals 1: ${item.is_active_check}`);
    });
    
  } catch (error) {
    console.error('❌ Error checking merchandise data:', error);
  } finally {
    if (connection) {
      connection.release();
    }
    process.exit(0);
  }
}

checkMerchandiseData();
