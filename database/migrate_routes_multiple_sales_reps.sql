-- Migration script to enable multiple sales reps per route
-- This creates a junction table for the many-to-many relationship

-- Create junction table for routes and sales reps
CREATE TABLE IF NOT EXISTS route_sales_reps (
  id INT PRIMARY KEY AUTO_INCREMENT,
  route_id INT NOT NULL,
  sales_rep_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_route_sales_rep (route_id, sales_rep_id),
  FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
  FOREIGN KEY (sales_rep_id) REFERENCES SalesRep(id) ON DELETE CASCADE,
  INDEX idx_route_id (route_id),
  INDEX idx_sales_rep_id (sales_rep_id)
);

-- Migrate existing data from routes.sales_rep_id to route_sales_reps
-- Only migrate if sales_rep_id is not 0 or NULL
INSERT INTO route_sales_reps (route_id, sales_rep_id)
SELECT id, sales_rep_id
FROM routes
WHERE sales_rep_id IS NOT NULL AND sales_rep_id != 0
ON DUPLICATE KEY UPDATE route_id = route_id;

-- Note: We keep the sales_rep_id and sales_rep_name columns in routes table for backward compatibility
-- but the primary source of truth will be the route_sales_reps junction table

