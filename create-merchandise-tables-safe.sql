-- Create Merchandise Management System Tables (Safe Version)
-- This script creates tables only if they don't exist (doesn't drop existing tables)

-- Merchandise Categories Table
CREATE TABLE IF NOT EXISTS merchandise_categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Merchandise Items Table
CREATE TABLE IF NOT EXISTS merchandise (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    category_id INT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES merchandise_categories(id) ON DELETE RESTRICT,
    INDEX idx_category_id (category_id),
    INDEX idx_is_active (is_active),
    INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- Merchandise Assignments Table
CREATE TABLE IF NOT EXISTS merchandise_assignments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    merchandise_id INT NOT NULL,
    staff_id INT NOT NULL,
    quantity_assigned INT NOT NULL,
    date_assigned DATE NOT NULL,
    comment TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (merchandise_id) REFERENCES merchandise(id) ON DELETE CASCADE,
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
    INDEX idx_merchandise_id (merchandise_id),
    INDEX idx_staff_id (staff_id),
    INDEX idx_date_assigned (date_assigned),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default categories (only if they don't exist)
INSERT IGNORE INTO merchandise_categories (name, description) VALUES
('T-Shirts', 'Company branded t-shirts and apparel'),
('Caps', 'Company branded caps and headwear'),
('Displays', 'Marketing displays and signage'),
('Stationery', 'Office supplies and stationery'),
('Promotional Items', 'Other promotional merchandise'),
('Uniforms', 'Employee uniforms and workwear');
