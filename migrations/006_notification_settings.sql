-- Add notification_settings table for customizable thresholds
CREATE TABLE IF NOT EXISTS notification_settings (
  type TEXT PRIMARY KEY,
  thresholds TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Insert default values
INSERT INTO notification_settings (type, thresholds, updated_at) VALUES
  ('ในหน่วย', '30', 0),
  ('ในกรม', '60', 0),
  ('บก.ใหญ่', '60', 0),
  ('นอกหน่วย', '120,60', 0)
ON CONFLICT(type) DO NOTHING;
