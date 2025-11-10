-- migrations/004_sent_notifications.sql
CREATE TABLE IF NOT EXISTS sent_notifications (
  event_id TEXT NOT NULL,
  kind TEXT NOT NULL,               -- e.g., 'pre_120','pre_60','pre_30'
  target TEXT NOT NULL,             -- e.g., 'boss','secretary'
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, kind, target)
);
