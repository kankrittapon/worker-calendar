-- migrations/003_add_notes.sql
ALTER TABLE events ADD COLUMN notes TEXT DEFAULT '';
