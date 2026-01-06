-- Performance indexes for Financial Dashboard queries
-- These indexes optimize the queries used in the dashboard stats endpoint

-- Indexes for sales_orders table
-- Optimizes queries filtering by status
CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(status);

-- Optimizes queries filtering by my_status
CREATE INDEX IF NOT EXISTS idx_sales_orders_my_status ON sales_orders(my_status);

-- Optimizes queries filtering by order_date
CREATE INDEX IF NOT EXISTS idx_sales_orders_order_date ON sales_orders(order_date);

-- Composite index for status and order_date queries
CREATE INDEX IF NOT EXISTS idx_sales_orders_status_date ON sales_orders(status, order_date);

-- Indexes for purchase_orders table
-- Optimizes queries filtering by status
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);

-- Optimizes queries filtering by order_date
CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_date ON purchase_orders(order_date);

-- Composite index for status and order_date queries
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status_date ON purchase_orders(status, order_date);

-- Indexes for client_ledger table
-- Optimizes SUM queries for receivables calculations
CREATE INDEX IF NOT EXISTS idx_client_ledger_debit_credit ON client_ledger(debit, credit);

-- Indexes for supplier_ledger table
-- Optimizes SUM queries for payables calculations
CREATE INDEX IF NOT EXISTS idx_supplier_ledger_debit_credit ON supplier_ledger(debit, credit);

-- Indexes for products table
-- Optimizes queries filtering by current_stock and reorder_level
CREATE INDEX IF NOT EXISTS idx_products_stock_reorder ON products(current_stock, reorder_level);

-- Optimizes queries filtering by is_active
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);

-- Composite index for low stock queries
CREATE INDEX IF NOT EXISTS idx_products_stock_active ON products(current_stock, reorder_level, is_active);

-- Indexes for credit_notes table
-- Optimizes queries filtering by my_status
CREATE INDEX IF NOT EXISTS idx_credit_notes_my_status ON credit_notes(my_status);

-- Note: Indexes on assets table are generally not needed for SUM queries on purchase_value
-- as these typically require full table scans anyway, but if you frequently filter assets,
-- consider adding indexes on commonly filtered columns

-- Verify indexes were created (run this separately to check)
-- SHOW INDEXES FROM sales_orders;
-- SHOW INDEXES FROM purchase_orders;
-- SHOW INDEXES FROM client_ledger;
-- SHOW INDEXES FROM supplier_ledger;
-- SHOW INDEXES FROM products;
-- SHOW INDEXES FROM credit_notes;

