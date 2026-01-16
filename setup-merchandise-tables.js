const db = require('./database/db');
const fs = require('fs');
const path = require('path');

async function setupMerchandiseTables() {
  let connection;
  try {
    console.log('🚀 Setting up merchandise tables...\n');
    
    // Read the SQL file (using safe version that doesn't drop tables)
    const sqlPath = path.join(__dirname, 'create-merchandise-tables-safe.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && s !== '\n');
    
    connection = await db.getConnection();
    
    console.log(`📝 Executing ${statements.length} SQL statements...\n`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip SHOW and DESCRIBE statements for now
      if (statement.startsWith('SHOW') || statement.startsWith('DESCRIBE')) {
        continue;
      }
      
      try {
        await connection.query(statement);
        console.log(`✅ Statement ${i + 1}/${statements.length} executed successfully`);
      } catch (error) {
        // Ignore "Table doesn't exist" errors for DROP TABLE statements
        if (statement.startsWith('DROP TABLE') && error.code === 'ER_BAD_TABLE_ERROR') {
          console.log(`⚠️  Table doesn't exist (expected): ${statement.match(/DROP TABLE IF EXISTS (\w+)/)?.[1]}`);
        } else {
          console.error(`❌ Error executing statement ${i + 1}:`, error.message);
          throw error;
        }
      }
    }
    
    // Verify tables were created
    console.log('\n🔍 Verifying tables...\n');
    const [tables] = await connection.query("SHOW TABLES LIKE 'merchandise%'");
    
    if (tables.length > 0) {
      console.log('✅ Tables created successfully:');
      tables.forEach(table => {
        const tableName = Object.values(table)[0];
        console.log(`   - ${tableName}`);
      });
      
      // Show table structures
      console.log('\n📊 Table structures:\n');
      for (const table of tables) {
        const tableName = Object.values(table)[0];
        console.log(`\n${tableName}:`);
        console.log('─'.repeat(60));
        const [columns] = await connection.query(`DESCRIBE ${tableName}`);
        columns.forEach(col => {
          const nullInfo = col.Null === 'NO' ? 'NOT NULL' : 'NULL';
          const keyInfo = col.Key ? `[${col.Key}]` : '';
          const defaultInfo = col.Default !== null ? `DEFAULT ${col.Default}` : '';
          console.log(`  ${col.Field.padEnd(25)} ${col.Type.padEnd(20)} ${nullInfo.padEnd(10)} ${keyInfo} ${defaultInfo}`);
        });
      }
      
      // Check for default categories
      const [categories] = await connection.query('SELECT COUNT(*) as count FROM merchandise_categories');
      console.log(`\n📦 Default categories: ${categories[0].count} inserted`);
      
    } else {
      console.log('⚠️  No merchandise tables found');
    }
    
    console.log('\n✅ Setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error setting up merchandise tables:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
    process.exit(0);
  }
}

// Run the setup
setupMerchandiseTables().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
