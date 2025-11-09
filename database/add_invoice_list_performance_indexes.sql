-- Performance indexes for invoice list page optimization
-- These indexes significantly improve query performance for sales orders filtering and pagination

-- Index on my_status (most common filter)
CREATE INDEX IF NOT EXISTS idx_sales_orders_my_status ON sales_orders(my_status);

-- Index on customer_id (for client filtering)
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer_id ON sales_orders(customer_id);

-- Index on order_date (for date filtering)
CREATE INDEX IF NOT EXISTS idx_sales_orders_order_date ON sales_orders(order_date);

-- Composite index for common query pattern: status + date
CREATE INDEX IF NOT EXISTS idx_sales_orders_status_date ON sales_orders(my_status, order_date);

-- Index on created_at (for ordering)
CREATE INDEX IF NOT EXISTS idx_sales_orders_created_at ON sales_orders(created_at);

-- Index on so_number (for search)
CREATE INDEX IF NOT EXISTS idx_sales_orders_so_number ON sales_orders(so_number);

-- Index on receipts invoice_number and status (for bulk receipt queries)
CREATE INDEX IF NOT EXISTS idx_receipts_invoice_number_status ON receipts(invoice_number, status);

-- Index on sales_order_items sales_order_id (for bulk item fetching)
CREATE INDEX IF NOT EXISTS idx_sales_order_items_sales_order_id ON sales_order_items(sales_order_id);

-- Composite index for sales_orders with customer joins
-- This helps with the LEFT JOIN performance
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer_status ON sales_orders(customer_id, my_status, order_date);

