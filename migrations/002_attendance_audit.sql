-- migrations/002_attendance_audit.sql
-- Track boss attendance per event (join/absent/busy)
CREATE TABLE IF NOT EXISTS attendance (
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,         -- join | absent | busy
  updated_by TEXT NOT NULL,     -- who performed the change (user_id or 'secretary:xxx')
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id)
);

-- Simple audit log for any action
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,     -- e.g., 'create_event','update_event','set_role','set_attendance'
  entity TEXT NOT NULL,     -- e.g., 'event:EVENT_ID','role:USER_ID'
  payload TEXT NOT NULL,    -- JSON string snapshot/min diff
  ts INTEGER NOT NULL
);
