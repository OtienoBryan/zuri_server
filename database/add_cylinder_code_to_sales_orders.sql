-- Add cylinder_code_id column to sales_orders table
ALTER TABLE sales_orders 
ADD COLUMN IF NOT EXISTS cylinder_code_id INT NULL,
ADD INDEX idx_cylinder_code_id (cylinder_code_id);

-- Create cylinder_codes table if it doesn't exist
CREATE TABLE IF NOT EXISTS `cylinder_codes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(100) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Insert sample cylinder codes (modify based on your actual codes)
INSERT INTO `cylinder_codes` (`code`) VALUES
('CYL-6KG'),
('CYL-13KG'),
('CYL-15KG'),
('CYL-50KG'),
('CYL-BULK'),
('CYL-STANDARD'),
('CYL-PREMIUM')
ON DUPLICATE KEY UPDATE code = VALUES(code);

