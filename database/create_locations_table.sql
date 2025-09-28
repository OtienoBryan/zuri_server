-- Migration: Create locations table
-- Date: 2024-12-20
-- Description: Create table for managing locations with associated routes

CREATE TABLE IF NOT EXISTS locations (
  id INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  route_id INT(11) NOT NULL,
  route_name VARCHAR(255) NOT NULL,
  status INT(11) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes for better performance
  INDEX idx_route_id (route_id),
  INDEX idx_status (status),
  INDEX idx_name (name),
  
  -- Foreign key constraint
  CONSTRAINT fk_locations_route FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
