-- Create Missing Merchandise Tables
-- This script creates only the tables that don't exist

-- Merchandise Stock Table
CREATE TABLE IF NOT EXISTS merchandise_stock (
    id INT PRIMARY KEY AUTO_INCREMENT,
    merchandise_id INT NOT NULL,
    store_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    received_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    received_by INT,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (merchandise_id) REFERENCES merchandise(id) ON DELETE RESTRICT,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT,
    INDEX idx_merchandise_id (merchandise_id),
    INDEX idx_store_id (store_id),
    INDEX idx_is_active (is_active),
    INDEX idx_received_date (received_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Merchandise Ledger Table for tracking all inventory movements
CREATE TABLE IF NOT EXISTS merchandise_ledger (
    id INT PRIMARY KEY AUTO_INCREMENT,
    merchandise_id INT NOT NULL,
    store_id INT NOT NULL,
    transaction_type ENUM('RECEIVE', 'ISSUE', 'ADJUSTMENT', 'TRANSFER') NOT NULL,
    quantity INT NOT NULL,
    balance_after INT NOT NULL,
    reference_id INT,
    reference_type ENUM('STOCK_RECEIPT', 'STOCK_ISSUE', 'ADJUSTMENT', 'TRANSFER') NOT NULL,
    notes TEXT,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (merchandise_id) REFERENCES merchandise(id) ON DELETE RESTRICT,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT,
    INDEX idx_merchandise_id (merchandise_id),
    INDEX idx_store_id (store_id),
    INDEX idx_transaction_type (transaction_type),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Show all merchandise tables
SHOW TABLES LIKE 'merchandise%';
