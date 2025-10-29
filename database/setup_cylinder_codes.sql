-- Complete setup for cylinder_codes table
-- Run this script to create the table, add tracking fields, and populate with sample data

-- Step 1: Create cylinder_codes table if it doesn't exist
CREATE TABLE IF NOT EXISTS `cylinder_codes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(100) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Step 2: Add tracking fields for region and date
ALTER TABLE cylinder_codes 
ADD COLUMN IF NOT EXISTS current_region INT NULL AFTER code,
ADD COLUMN IF NOT EXISTS last_assigned_date TIMESTAMP NULL AFTER current_region;

-- Step 3: Add foreign key constraint for current_region (if not exists)
-- Note: This will only work if regions table exists
SET @fk_exists = (
  SELECT COUNT(*) 
  FROM information_schema.TABLE_CONSTRAINTS 
  WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME = 'cylinder_codes'
  AND CONSTRAINT_NAME = 'fk_cylinder_codes_region'
  AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @sql = IF(@fk_exists = 0, 
  'ALTER TABLE cylinder_codes ADD CONSTRAINT fk_cylinder_codes_region FOREIGN KEY (current_region) REFERENCES Regions(id) ON DELETE SET NULL',
  'SELECT "Foreign key already exists" AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 4: Add index for better query performance (if not exists)
ALTER TABLE cylinder_codes
ADD INDEX IF NOT EXISTS idx_current_region (current_region);

-- Step 5: Add cylinder_code_id to sales_orders table if it doesn't exist
ALTER TABLE sales_orders 
ADD COLUMN IF NOT EXISTS cylinder_code_id INT NULL,
ADD INDEX IF NOT EXISTS idx_cylinder_code_id (cylinder_code_id);

-- Step 6: Insert sample cylinder codes
-- MODIFY THESE VALUES TO MATCH YOUR ACTUAL CYLINDER TYPES/CODES
INSERT INTO `cylinder_codes` (`code`) VALUES
('CYL-001'),
('CYL-002'),
('CYL-003'),
('CYL-004'),
('CYL-005'),
('CYL-006'),
('CYL-007'),
('CYL-008'),
('CYL-009'),
('CYL-010'),
('CYL-6KG-001'),
('CYL-6KG-002'),
('CYL-13KG-001'),
('CYL-13KG-002'),
('CYL-15KG-001'),
('CYL-15KG-002'),
('CYL-50KG-001'),
('CYL-50KG-002')
ON DUPLICATE KEY UPDATE code = VALUES(code);

-- Display the inserted cylinder codes
SELECT 
  cc.id, 
  cc.code, 
  cc.current_region,
  cc.last_assigned_date,
  r.name as current_region_name
FROM cylinder_codes cc
LEFT JOIN Regions r ON cc.current_region = r.id
ORDER BY cc.code ASC;

