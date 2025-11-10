-- migrations/001_init.sql
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  type TEXT NOT NULL,
  location TEXT NOT NULL,
  uniform TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);

CREATE TABLE IF NOT EXISTS roles (
  user_id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
