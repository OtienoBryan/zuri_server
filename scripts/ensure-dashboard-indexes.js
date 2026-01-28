const db = require('../database/db');
const fs = require('fs');
const path = require('path');

async function ensureIndexes() {
  try {
    console.log('🔍 Checking and creating dashboard performance indexes...\n');

    const indexes = [
      // Sales orders indexes
      { table: 'sales_orders', name: 'idx_sales_orders_status', sql: 'CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(status)' },
      { table: 'sales_orders', name: 'idx_sales_orders_my_status', sql: 'CREATE INDEX IF NOT EXISTS idx_sales_orders_my_status ON sales_orders(my_status)' },
      { table: 'sales_orders', name: 'idx_sales_orders_order_date', sql: 'CREATE INDEX IF NOT EXISTS idx_sales_orders_order_date ON sales_orders(order_date)' },
      { table: 'sales_orders', name: 'idx_sales_orders_status_date', sql: 'CREATE INDEX IF NOT EXISTS idx_sales_orders_status_date ON sales_orders(status, order_date)' },
      
      // Purchase orders indexes
      { table: 'purchase_orders', name: 'idx_purchase_orders_status', sql: 'CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status)' },
      { table: 'purchase_orders', name: 'idx_purchase_orders_order_date', sql: 'CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_date ON purchase_orders(order_date)' },
      { table: 'purchase_orders', name: 'idx_purchase_orders_status_date', sql: 'CREATE INDEX IF NOT EXISTS idx_purchase_orders_status_date ON purchase_orders(status, order_date)' },
      
      // Ledger indexes
      { table: 'client_ledger', name: 'idx_client_ledger_debit_credit', sql: 'CREATE INDEX IF NOT EXISTS idx_client_ledger_debit_credit ON client_ledger(debit, credit)' },
      { table: 'supplier_ledger', name: 'idx_supplier_ledger_debit_credit', sql: 'CREATE INDEX IF NOT EXISTS idx_supplier_ledger_debit_credit ON supplier_ledger(debit, credit)' },
      
      // Products indexes
      { table: 'products', name: 'idx_products_stock_reorder', sql: 'CREATE INDEX IF NOT EXISTS idx_products_stock_reorder ON products(current_stock, reorder_level)' },
      { table: 'products', name: 'idx_products_is_active', sql: 'CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active)' },
      { table: 'products', name: 'idx_products_stock_active', sql: 'CREATE INDEX IF NOT EXISTS idx_products_stock_active ON products(current_stock, reorder_level, is_active)' },
      
      // Credit notes indexes
      { table: 'credit_notes', name: 'idx_credit_notes_my_status', sql: 'CREATE INDEX IF NOT EXISTS idx_credit_notes_my_status ON credit_notes(my_status)' },
    ];

    for (const index of indexes) {
      try {
        await db.query(index.sql);
        console.log(`✅ Index ${index.name} on ${index.table} - OK`);
      } catch (error) {
        if (error.code === 'ER_DUP_KEYNAME') {
          console.log(`⚠️  Index ${index.name} on ${index.table} - Already exists`);
        } else {
          console.error(`❌ Failed to create index ${index.name} on ${index.table}:`, error.message);
        }
      }
    }

    console.log('\n✨ Index check complete!\n');
    
    // Verify indexes
    console.log('📊 Verifying indexes...\n');
    const tables = ['sales_orders', 'purchase_orders', 'client_ledger', 'supplier_ledger', 'products', 'credit_notes'];
    for (const table of tables) {
      try {
        const [indexes] = await db.query(`SHOW INDEXES FROM ${table}`);
        const indexNames = indexes.map(idx => idx.Key_name).filter((v, i, a) => a.indexOf(v) === i);
        console.log(`${table}: ${indexNames.length} indexes - ${indexNames.join(', ')}`);
      } catch (error) {
        console.error(`Failed to check indexes for ${table}:`, error.message);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('Error ensuring indexes:', error);
    process.exit(1);
  }
}

ensureIndexes();
