const db = require('./database/db');
const fs = require('fs');
const path = require('path');

async function setupCylinderLedger() {
  console.log('🔧 Setting up cylinder_ledger table...\n');
  
  try {
    // Step 1: Create cylinder_ledger table
    console.log('Step 1: Creating cylinder_ledger table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS cylinder_ledger (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cylinder_code_id INT NOT NULL,
        transaction_type ENUM(
          'ASSIGNED',
          'DELIVERED',
          'RETURNED',
          'TRANSFERRED',
          'MAINTENANCE',
          'RETIRED',
          'RECEIVED_BACK'
        ) NOT NULL,
        
        sales_order_id INT NULL,
        so_number VARCHAR(50) NULL,
        
        from_region_id INT NULL,
        to_region_id INT NULL,
        current_region_id INT NULL,
        
        rider_id INT NULL,
        rider_name VARCHAR(100) NULL,
        
        customer_id INT NULL,
        customer_name VARCHAR(255) NULL,
        
        transaction_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        notes TEXT NULL,
        
        performed_by INT NULL,
        performed_by_name VARCHAR(100) NULL,
        
        status_before VARCHAR(50) NULL,
        status_after VARCHAR(50) NULL,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_cylinder_code_id (cylinder_code_id),
        INDEX idx_transaction_type (transaction_type),
        INDEX idx_transaction_date (transaction_date),
        INDEX idx_sales_order_id (sales_order_id),
        INDEX idx_customer_id (customer_id),
        INDEX idx_rider_id (rider_id),
        INDEX idx_current_region_id (current_region_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 
      COMMENT='Tracks all cylinder movements and transactions'
    `);
    console.log('✅ Table created/verified\n');

    // Step 2: Try to add foreign keys (may fail if referenced tables don't exist)
    console.log('Step 2: Adding foreign key constraints...');
    
    const foreignKeys = [
      {
        name: 'fk_cl_cylinder_code',
        sql: 'ALTER TABLE cylinder_ledger ADD CONSTRAINT fk_cl_cylinder_code FOREIGN KEY (cylinder_code_id) REFERENCES cylinder_codes(id) ON DELETE CASCADE'
      },
      {
        name: 'fk_cl_sales_order',
        sql: 'ALTER TABLE cylinder_ledger ADD CONSTRAINT fk_cl_sales_order FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE SET NULL'
      },
      {
        name: 'fk_cl_from_region',
        sql: 'ALTER TABLE cylinder_ledger ADD CONSTRAINT fk_cl_from_region FOREIGN KEY (from_region_id) REFERENCES Regions(id) ON DELETE SET NULL'
      },
      {
        name: 'fk_cl_to_region',
        sql: 'ALTER TABLE cylinder_ledger ADD CONSTRAINT fk_cl_to_region FOREIGN KEY (to_region_id) REFERENCES Regions(id) ON DELETE SET NULL'
      },
      {
        name: 'fk_cl_current_region',
        sql: 'ALTER TABLE cylinder_ledger ADD CONSTRAINT fk_cl_current_region FOREIGN KEY (current_region_id) REFERENCES Regions(id) ON DELETE SET NULL'
      },
      {
        name: 'fk_cl_rider',
        sql: 'ALTER TABLE cylinder_ledger ADD CONSTRAINT fk_cl_rider FOREIGN KEY (rider_id) REFERENCES Riders(id) ON DELETE SET NULL'
      },
      {
        name: 'fk_cl_customer',
        sql: 'ALTER TABLE cylinder_ledger ADD CONSTRAINT fk_cl_customer FOREIGN KEY (customer_id) REFERENCES Clients(id) ON DELETE SET NULL'
      },
      {
        name: 'fk_cl_performed_by',
        sql: 'ALTER TABLE cylinder_ledger ADD CONSTRAINT fk_cl_performed_by FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL'
      }
    ];

    for (const fk of foreignKeys) {
      try {
        // Check if foreign key already exists
        const [check] = await db.query(`
          SELECT COUNT(*) as fk_count
          FROM information_schema.TABLE_CONSTRAINTS 
          WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME = 'cylinder_ledger'
          AND CONSTRAINT_NAME = ?
          AND CONSTRAINT_TYPE = 'FOREIGN KEY'
        `, [fk.name]);
        
        if (check[0].fk_count === 0) {
          await db.query(fk.sql);
          console.log(`✅ Added ${fk.name}`);
        } else {
          console.log(`✅ ${fk.name} already exists`);
        }
      } catch (error) {
        console.log(`⚠️  Could not add ${fk.name}: ${error.message}`);
      }
    }
    console.log('');

    // Step 3: Create view
    console.log('Step 3: Creating cylinder_movement_history view...');
    await db.query(`
      CREATE OR REPLACE VIEW cylinder_movement_history AS
      SELECT 
        cl.id,
        cl.transaction_type,
        cc.code as cylinder_code,
        cl.so_number,
        cl.transaction_date,
        from_r.name as from_region,
        to_r.name as to_region,
        current_r.name as current_region,
        cl.rider_name,
        cl.customer_name,
        cl.notes,
        cl.performed_by_name,
        cl.status_before,
        cl.status_after,
        cl.created_at
      FROM cylinder_ledger cl
      LEFT JOIN cylinder_codes cc ON cl.cylinder_code_id = cc.id
      LEFT JOIN Regions from_r ON cl.from_region_id = from_r.id
      LEFT JOIN Regions to_r ON cl.to_region_id = to_r.id
      LEFT JOIN Regions current_r ON cl.current_region_id = current_r.id
      ORDER BY cl.transaction_date DESC, cl.id DESC
    `);
    console.log('✅ View created/updated\n');

    // Step 4: Display table info
    console.log('Step 4: Verifying setup...');
    const [result] = await db.query('SELECT COUNT(*) as total FROM cylinder_ledger');
    console.log(`✅ Total entries in ledger: ${result[0].total}\n`);

    console.log('✅ Setup completed successfully!');
    console.log('\n📝 Cylinder Ledger Features:');
    console.log('   ✓ Track cylinder assignments');
    console.log('   ✓ Track deliveries and returns');
    console.log('   ✓ Track region transfers');
    console.log('   ✓ Complete audit trail');
    console.log('   ✓ View: cylinder_movement_history for easy querying\n');

    console.log('📊 Transaction Types:');
    console.log('   - ASSIGNED: Cylinder assigned to order/rider');
    console.log('   - DELIVERED: Cylinder delivered to customer');
    console.log('   - RETURNED: Cylinder returned from customer');
    console.log('   - TRANSFERRED: Cylinder transferred between regions');
    console.log('   - MAINTENANCE: Cylinder sent for maintenance');
    console.log('   - RETIRED: Cylinder retired from service');
    console.log('   - RECEIVED_BACK: Cylinder received back to warehouse\n');

  } catch (error) {
    console.error('❌ Error during setup:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the setup
setupCylinderLedger();

