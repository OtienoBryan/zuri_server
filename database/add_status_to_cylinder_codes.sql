-- Add status column to cylinder_codes table to track cylinder status

ALTER TABLE cylinder_codes 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'AVAILABLE' AFTER current_region;

-- Add index for better query performance
ALTER TABLE cylinder_codes
ADD INDEX IF NOT EXISTS idx_status (status);

-- Update existing cylinders based on their last transaction in cylinder_ledger
UPDATE cylinder_codes cc
LEFT JOIN (
  SELECT 
    cylinder_code_id,
    status_after
  FROM cylinder_ledger cl1
  WHERE transaction_date = (
    SELECT MAX(transaction_date) 
    FROM cylinder_ledger cl2 
    WHERE cl2.cylinder_code_id = cl1.cylinder_code_id
  )
) latest ON cc.id = latest.cylinder_code_id
SET cc.status = COALESCE(latest.status_after, 'AVAILABLE');

