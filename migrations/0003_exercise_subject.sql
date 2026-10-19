-- Add the category to existing databases without changing any member or record.
INSERT OR IGNORE INTO subjects(name,created_at) VALUES('运动',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
