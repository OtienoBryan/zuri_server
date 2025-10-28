-- Populate Regions table with sample data
-- Run this script if the Regions table is empty

-- First, check if we need to create the table (in case it doesn't exist)
CREATE TABLE IF NOT EXISTS `Regions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `countryId` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Insert sample regions (modify based on your actual regions)
INSERT INTO `Regions` (`name`, `countryId`) VALUES
('Nairobi', 1),
('Mombasa', 1),
('Kisumu', 1),
('Nakuru', 1),
('Eldoret', 1),
('Thika', 1),
('Machakos', 1),
('Central Region', 1),
('Eastern Region', 1),
('Western Region', 1),
('Rift Valley', 1),
('Coast Region', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name);

