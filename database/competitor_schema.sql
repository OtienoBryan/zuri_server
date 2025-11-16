-- Competitor Table Schema
-- This table tracks competitor products and mechanisms

CREATE TABLE IF NOT EXISTS competitor (
    id INT(11) NOT NULL AUTO_INCREMENT,
    outlet VARCHAR(100) NOT NULL,
    outlet_id INT(11) NOT NULL,
    merchandiser INT(11) NOT NULL,
    competing_product VARCHAR(100) NOT NULL,
    mechanism VARCHAR(100) NOT NULL,
    zuri_product VARCHAR(100) NOT NULL,
    date VARCHAR(50) NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_outlet_id (outlet_id),
    INDEX idx_merchandiser (merchandiser),
    INDEX idx_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

