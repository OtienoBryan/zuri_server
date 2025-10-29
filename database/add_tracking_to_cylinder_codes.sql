-- Add tracking fields to cylinder_codes table
-- This migration adds current_region and last_assigned_date for tracking cylinder movements

ALTER TABLE cylinder_codes 
ADD COLUMN IF NOT EXISTS current_region INT NULL AFTER code,
ADD COLUMN IF NOT EXISTS last_assigned_date TIMESTAMP NULL AFTER current_region;

-- Add foreign key constraint for current_region
ALTER TABLE cylinder_codes
ADD CONSTRAINT fk_cylinder_codes_region 
FOREIGN KEY (current_region) REFERENCES Regions(id) 
ON DELETE SET NULL;

-- Add index for better query performance
ALTER TABLE cylinder_codes
ADD INDEX idx_current_region (current_region);

