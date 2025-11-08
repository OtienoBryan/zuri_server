-- Create rep_type table if it doesn't exist
CREATE TABLE IF NOT EXISTS rep_type (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default rep types if they don't exist
INSERT IGNORE INTO rep_type (name, description) VALUES
('Retail', 'Retail sales representative'),
('Key Account', 'Key account sales representative'),
('Distributor', 'Distributor sales representative');

-- Add rep_type_id column to SalesRep table (run this manually if column doesn't exist)
-- ALTER TABLE SalesRep ADD COLUMN rep_type_id INT NULL;

-- Add foreign key constraint (run this manually after adding the column)
-- ALTER TABLE SalesRep ADD CONSTRAINT fk_salesrep_rep_type FOREIGN KEY (rep_type_id) REFERENCES rep_type(id);

