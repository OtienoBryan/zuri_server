-- Verify and create cylinder-related tables if they don't exist

-- Check if cylinder_codes table exists
SELECT 'Checking cylinder_codes table...' as status;

-- Create cylinder_codes table if it doesn't exist
CREATE TABLE IF NOT EXISTS `cylinder_codes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(100) NOT NULL,
  `current_region` INT NULL,
  `last_assigned_date` TIMESTAMP NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_code` (`code`),
  INDEX `idx_current_region` (`current_region`),
  FOREIGN KEY (`current_region`) REFERENCES `Regions`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert sample cylinder codes if table is empty
INSERT INTO `cylinder_codes` (`code`) 
SELECT * FROM (SELECT 'CYL-001' as code) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM `cylinder_codes` WHERE `code` = 'CYL-001')
UNION ALL
SELECT * FROM (SELECT 'CYL-002') AS tmp
WHERE NOT EXISTS (SELECT 1 FROM `cylinder_codes` WHERE `code` = 'CYL-002')
UNION ALL
SELECT * FROM (SELECT 'CYL-003') AS tmp
WHERE NOT EXISTS (SELECT 1 FROM `cylinder_codes` WHERE `code` = 'CYL-003')
UNION ALL
SELECT * FROM (SELECT 'CYL-004') AS tmp
WHERE NOT EXISTS (SELECT 1 FROM `cylinder_codes` WHERE `code` = 'CYL-004')
UNION ALL
SELECT * FROM (SELECT 'CYL-005') AS tmp
WHERE NOT EXISTS (SELECT 1 FROM `cylinder_codes` WHERE `code` = 'CYL-005')
UNION ALL
SELECT * FROM (SELECT 'CYL-6KG-001') AS tmp
WHERE NOT EXISTS (SELECT 1 FROM `cylinder_codes` WHERE `code` = 'CYL-6KG-001')
UNION ALL
SELECT * FROM (SELECT 'CYL-6KG-002') AS tmp
WHERE NOT EXISTS (SELECT 1 FROM `cylinder_codes` WHERE `code` = 'CYL-6KG-002')
UNION ALL
SELECT * FROM (SELECT 'CYL-13KG-001') AS tmp
WHERE NOT EXISTS (SELECT 1 FROM `cylinder_codes` WHERE `code` = 'CYL-13KG-001')
UNION ALL
SELECT * FROM (SELECT 'CYL-13KG-002') AS tmp
WHERE NOT EXISTS (SELECT 1 FROM `cylinder_codes` WHERE `code` = 'CYL-13KG-002')
UNION ALL
SELECT * FROM (SELECT 'CYL-50KG-001') AS tmp
WHERE NOT EXISTS (SELECT 1 FROM `cylinder_codes` WHERE `code` = 'CYL-50KG-001');

-- Check if cylinder_ledger table exists (without foreign key to cylinder_codes yet)
CREATE TABLE IF NOT EXISTS `cylinder_ledger` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `cylinder_code_id` INT NOT NULL,
  `transaction_type` ENUM(
    'ASSIGNED',
    'DELIVERED',
    'RETURNED',
    'TRANSFERRED',
    'MAINTENANCE',
    'RETIRED',
    'RECEIVED_BACK'
  ) NOT NULL,
  `sales_order_id` INT NULL,
  `so_number` VARCHAR(50) NULL,
  `from_region_id` INT NULL,
  `to_region_id` INT NULL,
  `current_region_id` INT NULL,
  `rider_id` INT NULL,
  `rider_name` VARCHAR(100) NULL,
  `customer_id` INT NULL,
  `customer_name` VARCHAR(255) NULL,
  `transaction_date` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `notes` TEXT NULL,
  `performed_by` INT NULL,
  `performed_by_name` VARCHAR(100) NULL,
  `status_before` VARCHAR(50) NULL,
  `status_after` VARCHAR(50) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_cylinder_code_id` (`cylinder_code_id`),
  INDEX `idx_transaction_type` (`transaction_type`),
  INDEX `idx_transaction_date` (`transaction_date`),
  INDEX `idx_sales_order_id` (`sales_order_id`),
  INDEX `idx_current_region_id` (`current_region_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Tracks all cylinder movements and transactions';

-- Show current cylinder codes
SELECT 'Current cylinder codes in database:' as info;
SELECT id, code, current_region, last_assigned_date FROM cylinder_codes ORDER BY code;

-- Show count
SELECT COUNT(*) as total_cylinders FROM cylinder_codes;

