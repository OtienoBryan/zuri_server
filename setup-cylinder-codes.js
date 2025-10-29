const db = require('./database/db');

async function setupCylinderCodes() {
  console.log('🔧 Setting up cylinder_codes table...\n');
  
  try {
    // Step 1: Create cylinder_codes table
    console.log('Step 1: Creating cylinder_codes table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS cylinder_codes (
        id INT NOT NULL AUTO_INCREMENT,
        code VARCHAR(100) NOT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY unique_code (code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Table created/verified\n');

    // Step 2: Check if tracking fields exist
    console.log('Step 2: Checking for tracking fields...');
    const [columns] = await db.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'cylinder_codes'
    `);
    
    const columnNames = columns.map(col => col.COLUMN_NAME);
    
    // Add current_region if it doesn't exist
    if (!columnNames.includes('current_region')) {
      console.log('Adding current_region column...');
      await db.query(`
        ALTER TABLE cylinder_codes 
        ADD COLUMN current_region INT NULL AFTER code
      `);
      console.log('✅ current_region added');
    } else {
      console.log('✅ current_region already exists');
    }
    
    // Add last_assigned_date if it doesn't exist
    if (!columnNames.includes('last_assigned_date')) {
      console.log('Adding last_assigned_date column...');
      await db.query(`
        ALTER TABLE cylinder_codes 
        ADD COLUMN last_assigned_date TIMESTAMP NULL AFTER current_region
      `);
      console.log('✅ last_assigned_date added');
    } else {
      console.log('✅ last_assigned_date already exists');
    }
    console.log('');

    // Step 3: Add foreign key constraint (if regions table exists)
    console.log('Step 3: Checking foreign key constraint...');
    try {
      const [fkCheck] = await db.query(`
        SELECT COUNT(*) as fk_count
        FROM information_schema.TABLE_CONSTRAINTS 
        WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = 'cylinder_codes'
        AND CONSTRAINT_NAME = 'fk_cylinder_codes_region'
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
      `);
      
      if (fkCheck[0].fk_count === 0) {
        console.log('Adding foreign key constraint...');
        await db.query(`
          ALTER TABLE cylinder_codes 
          ADD CONSTRAINT fk_cylinder_codes_region 
          FOREIGN KEY (current_region) REFERENCES Regions(id) 
          ON DELETE SET NULL
        `);
        console.log('✅ Foreign key constraint added');
      } else {
        console.log('✅ Foreign key constraint already exists');
      }
    } catch (error) {
      console.log('⚠️  Could not add foreign key (regions table may not exist)');
    }
    console.log('');

    // Step 4: Add index
    console.log('Step 4: Adding indexes...');
    try {
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_current_region ON cylinder_codes(current_region)
      `);
      console.log('✅ Index added\n');
    } catch (error) {
      console.log('⚠️  Index may already exist\n');
    }

    // Step 5: Add cylinder_code_id to sales_orders
    console.log('Step 5: Updating sales_orders table...');
    const [soColumns] = await db.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'sales_orders'
    `);
    
    const soColumnNames = soColumns.map(col => col.COLUMN_NAME);
    
    if (!soColumnNames.includes('cylinder_code_id')) {
      console.log('Adding cylinder_code_id to sales_orders...');
      await db.query(`
        ALTER TABLE sales_orders 
        ADD COLUMN cylinder_code_id INT NULL
      `);
      await db.query(`
        CREATE INDEX idx_cylinder_code_id ON sales_orders(cylinder_code_id)
      `);
      console.log('✅ cylinder_code_id added to sales_orders');
    } else {
      console.log('✅ cylinder_code_id already exists in sales_orders');
    }
    console.log('');

    // Step 6: Insert sample cylinder codes
    console.log('Step 6: Inserting sample cylinder codes...');
    const cylinderCodes = [
      'CYL-001', 'CYL-002', 'CYL-003', 'CYL-004', 'CYL-005',
      'CYL-006', 'CYL-007', 'CYL-008', 'CYL-009', 'CYL-010',
      'CYL-6KG-001', 'CYL-6KG-002', 'CYL-6KG-003', 'CYL-6KG-004', 'CYL-6KG-005',
      'CYL-13KG-001', 'CYL-13KG-002', 'CYL-13KG-003', 'CYL-13KG-004', 'CYL-13KG-005',
      'CYL-15KG-001', 'CYL-15KG-002', 'CYL-15KG-003',
      'CYL-50KG-001', 'CYL-50KG-002', 'CYL-50KG-003'
    ];

    for (const code of cylinderCodes) {
      await db.query(
        'INSERT INTO cylinder_codes (code) VALUES (?) ON DUPLICATE KEY UPDATE code = VALUES(code)',
        [code]
      );
    }
    console.log(`✅ Inserted ${cylinderCodes.length} cylinder codes\n`);

    // Step 7: Display results
    console.log('Step 7: Verifying setup...');
    const [result] = await db.query('SELECT COUNT(*) as total FROM cylinder_codes');
    console.log(`✅ Total cylinder codes in database: ${result[0].total}\n`);

    const [codes] = await db.query(`
      SELECT 
        cc.id, 
        cc.code, 
        cc.current_region,
        cc.last_assigned_date,
        r.name as current_region_name
      FROM cylinder_codes cc
      LEFT JOIN Regions r ON cc.current_region = r.id
      ORDER BY cc.code ASC
      LIMIT 10
    `);

    console.log('Sample cylinder codes:');
    console.table(codes);

    console.log('\n✅ Setup completed successfully!');
    console.log('\n📝 You can now:');
    console.log('   1. Refresh your Customer Orders page');
    console.log('   2. Assign riders with cylinder codes');
    console.log('   3. Track cylinder movements across regions\n');

  } catch (error) {
    console.error('❌ Error during setup:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the setup
setupCylinderCodes();

