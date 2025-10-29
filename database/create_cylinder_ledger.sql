-- Create cylinder_ledger table to track cylinder movements
-- This table records all movements and transactions involving cylinders

CREATE TABLE IF NOT EXISTS cylinder_ledger (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cylinder_code_id INT NOT NULL,
  transaction_type ENUM(
    'ASSIGNED',           -- Cylinder assigned to an order/rider
    'DELIVERED',          -- Cylinder delivered to customer
    'RETURNED',           -- Cylinder returned from customer
    'TRANSFERRED',        -- Cylinder transferred between regions
    'MAINTENANCE',        -- Cylinder sent for maintenance
    'RETIRED',            -- Cylinder retired from service
    'RECEIVED_BACK'       -- Cylinder received back to warehouse
  ) NOT NULL,
  
  -- Order reference
  sales_order_id INT NULL,
  so_number VARCHAR(50) NULL,
  
  -- Region tracking
  from_region_id INT NULL,
  to_region_id INT NULL,
  current_region_id INT NULL,
  
  -- Rider tracking
  rider_id INT NULL,
  rider_name VARCHAR(100) NULL,
  
  -- Customer information
  customer_id INT NULL,
  customer_name VARCHAR(255) NULL,
  
  -- Transaction details
  transaction_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT NULL,
  
  -- User tracking
  performed_by INT NULL,
  performed_by_name VARCHAR(100) NULL,
  
  -- Status before and after
  status_before VARCHAR(50) NULL,
  status_after VARCHAR(50) NULL,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Foreign keys
  FOREIGN KEY (cylinder_code_id) REFERENCES cylinder_codes(id) ON DELETE CASCADE,
  FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE SET NULL,
  FOREIGN KEY (from_region_id) REFERENCES Regions(id) ON DELETE SET NULL,
  FOREIGN KEY (to_region_id) REFERENCES Regions(id) ON DELETE SET NULL,
  FOREIGN KEY (current_region_id) REFERENCES Regions(id) ON DELETE SET NULL,
  FOREIGN KEY (rider_id) REFERENCES Riders(id) ON DELETE SET NULL,
  FOREIGN KEY (customer_id) REFERENCES Clients(id) ON DELETE SET NULL,
  FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL,
  
  -- Indexes for better query performance
  INDEX idx_cylinder_code_id (cylinder_code_id),
  INDEX idx_transaction_type (transaction_type),
  INDEX idx_transaction_date (transaction_date),
  INDEX idx_sales_order_id (sales_order_id),
  INDEX idx_customer_id (customer_id),
  INDEX idx_rider_id (rider_id),
  INDEX idx_current_region_id (current_region_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Tracks all cylinder movements and transactions';

-- Create a view for easier querying of cylinder movement history
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
  cl.created_at
FROM cylinder_ledger cl
LEFT JOIN cylinder_codes cc ON cl.cylinder_code_id = cc.id
LEFT JOIN Regions from_r ON cl.from_region_id = from_r.id
LEFT JOIN Regions to_r ON cl.to_region_id = to_r.id
LEFT JOIN Regions current_r ON cl.current_region_id = current_r.id
ORDER BY cl.transaction_date DESC, cl.id DESC;

-- Add a comment to the view
ALTER VIEW cylinder_movement_history COMMENT = 'Provides human-readable view of cylinder movements';

