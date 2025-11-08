-- Create feedback_report table with the specified schema
CREATE TABLE IF NOT EXISTS feedback_report (
  id INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  appoint_id INT(11) NOT NULL,
  user_id INT(11) NOT NULL,
  name VARCHAR(100) NOT NULL,
  contact VARCHAR(50) NOT NULL,
  comment TEXT NOT NULL,
  date VARCHAR(50) NOT NULL,
  INDEX idx_appoint_id (appoint_id),
  INDEX idx_user_id (user_id),
  INDEX idx_date (date)
);

