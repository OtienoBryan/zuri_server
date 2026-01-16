const db = require('./database/db');
const fs = require('fs');
const path = require('path');

async function createMissingTables() {
  let connection;
  try {
    console.log('🚀 Creating missing merchandise tables...\n');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'create-missing-merchandise-tables.sql');
    let sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Remove comments
    sql = sql.replace(/--.*$/gm, '');
    
    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(s => s.trim().replace(/\n/g, ' '))
      .filter(s => {
        const trimmed = s.trim();
        return trimmed.length > 0 && trimmed.toUpperCase().startsWith('CREATE');
      });
    
    console.log(`Found ${statements.length} CREATE TABLE statements`);
    
    connection = await db.getConnection();
    
    console.log(`📝 Executing ${statements.length} SQL statements...\n`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      try {
        await connection.query(statement);
        console.log(`✅ Statement ${i + 1}/${statements.length} executed successfully`);
      } catch (error) {
        if (error.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log(`⚠️  Table already exists (skipping): ${statement.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1]}`);
        } else {
          console.error(`❌ Error executing statement ${i + 1}:`, error.message);
          throw error;
        }
      }
    }
    
    // Verify tables
    console.log('\n🔍 Verifying tables...\n');
    const [tables] = await connection.query("SHOW TABLES LIKE 'merchandise%'");
    
    if (tables.length > 0) {
      console.log('✅ All merchandise tables:');
      tables.forEach(table => {
        const tableName = Object.values(table)[0];
        console.log(`   ✓ ${tableName}`);
      });
    }
    
    console.log('\n✅ Setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error creating tables:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
    process.exit(0);
  }
}

// Run the setup
createMissingTables().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
