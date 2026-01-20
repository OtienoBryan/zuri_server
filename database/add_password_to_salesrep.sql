-- Add password field to SalesRep table
ALTER TABLE SalesRep ADD COLUMN IF NOT EXISTS password VARCHAR(255) DEFAULT NULL;
