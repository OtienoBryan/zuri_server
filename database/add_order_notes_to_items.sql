-- Add order_notes field to sales_order_items table
-- This migration adds item-specific notes for sales order items

ALTER TABLE sales_order_items 
ADD COLUMN order_notes TEXT DEFAULT NULL AFTER total_price;

-- Add comment to document the new field
ALTER TABLE sales_order_items 
MODIFY COLUMN order_notes TEXT DEFAULT NULL COMMENT 'Specific notes for this order item';

