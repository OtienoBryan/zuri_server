-- Performance optimization indexes for sales_orders table
-- Run this script to improve query performance on the customer orders page

-- Index on customer_id (foreign key) - frequently used in JOINs
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer_id ON sales_orders(customer_id);

-- Index on created_at - used for ORDER BY in main query
CREATE INDEX IF NOT EXISTS idx_sales_orders_created_at ON sales_orders(created_at DESC);

-- Index on my_status - used for filtering
CREATE INDEX IF NOT EXISTS idx_sales_orders_my_status ON sales_orders(my_status);

-- Composite index for common filter combinations
CREATE INDEX IF NOT EXISTS idx_sales_orders_status_created ON sales_orders(my_status, created_at DESC);

-- Index on rider_id - used for filtering
CREATE INDEX IF NOT EXISTS idx_sales_orders_rider_id ON sales_orders(rider_id);

-- Index on sales_order_items for faster JOIN
CREATE INDEX IF NOT EXISTS idx_sales_order_items_order_id ON sales_order_items(sales_order_id);

-- Index on products.id for faster JOIN (if not exists)
CREATE INDEX IF NOT EXISTS idx_products_id ON products(id);

-- Index on clients.id for faster JOIN
CREATE INDEX IF NOT EXISTS idx_clients_id ON Clients(id);

