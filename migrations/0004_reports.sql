CREATE INDEX entries_date ON entries(date,member_id);
CREATE INDEX day_activity_date ON day_activity(date,member_id);
CREATE INDEX revisions_restore ON revisions(entity,entity_key,changed_at);
CREATE TRIGGER settings_history BEFORE UPDATE ON settings BEGIN
 INSERT INTO revisions(entity,entity_key,before_json,changed_at) VALUES('settings','1',json_object('exam_date',old.exam_date,'version',old.version),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
