-- Simple script to insert cylinder codes
-- Use this if the table already exists and you just need to add codes

-- Clear existing codes (OPTIONAL - remove these lines if you want to keep existing codes)
-- DELETE FROM cylinder_codes;

-- Insert cylinder codes
-- MODIFY THESE VALUES TO MATCH YOUR ACTUAL CYLINDER TYPES/CODES
INSERT INTO `cylinder_codes` (`code`) VALUES
('CYL-001'),
('CYL-002'),
('CYL-003'),
('CYL-004'),
('CYL-005'),
('CYL-006'),
('CYL-007'),
('CYL-008'),
('CYL-009'),
('CYL-010'),
('CYL-6KG-001'),
('CYL-6KG-002'),
('CYL-6KG-003'),
('CYL-6KG-004'),
('CYL-6KG-005'),
('CYL-13KG-001'),
('CYL-13KG-002'),
('CYL-13KG-003'),
('CYL-13KG-004'),
('CYL-13KG-005'),
('CYL-15KG-001'),
('CYL-15KG-002'),
('CYL-15KG-003'),
('CYL-50KG-001'),
('CYL-50KG-002'),
('CYL-50KG-003')
ON DUPLICATE KEY UPDATE code = VALUES(code);

-- Verify the inserted codes
SELECT COUNT(*) as total_cylinder_codes FROM cylinder_codes;
SELECT * FROM cylinder_codes ORDER BY code ASC;

