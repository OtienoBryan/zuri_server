-- Add cylinder_type field to products table
-- This migration adds cylinder type for products

ALTER TABLE products 
ADD COLUMN cylinder_type VARCHAR(50) DEFAULT NULL AFTER category;

-- Add comment to document the new field
ALTER TABLE products 
MODIFY COLUMN cylinder_type VARCHAR(50) DEFAULT NULL COMMENT 'Type of cylinder for gas products (e.g., 6kg, 13kg, etc.)';

