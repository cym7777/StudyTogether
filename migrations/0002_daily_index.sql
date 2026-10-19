-- Avoid scanning every historical task to count checked-in days on each homepage poll.
CREATE TABLE day_activity (
 member_id TEXT NOT NULL REFERENCES members(id), date TEXT NOT NULL,
 task_count INTEGER NOT NULL DEFAULT 0 CHECK(task_count>=0), has_summary INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(member_id,date)
);
INSERT INTO day_activity(member_id,date,task_count,has_summary)
 SELECT member_id,date,0,CASE WHEN trim(summary)<>'' THEN 1 ELSE 0 END FROM entries;
INSERT INTO day_activity(member_id,date,task_count)
 SELECT member_id,date,count(*) FROM tasks WHERE deleted_at IS NULL GROUP BY member_id,date
 ON CONFLICT(member_id,date) DO UPDATE SET task_count=excluded.task_count;
DROP VIEW active_days;
CREATE VIEW active_days AS SELECT member_id,date FROM day_activity WHERE task_count>0 OR has_summary=1;
CREATE INDEX tasks_home ON tasks(date,kind,deleted_at,member_id);
CREATE TRIGGER task_activity_insert AFTER INSERT ON tasks WHEN new.deleted_at IS NULL BEGIN
 INSERT INTO day_activity(member_id,date,task_count) VALUES(new.member_id,new.date,1)
 ON CONFLICT(member_id,date) DO UPDATE SET task_count=task_count+1;
END;
CREATE TRIGGER task_activity_update AFTER UPDATE ON tasks
 WHEN old.deleted_at IS NOT new.deleted_at OR old.member_id<>new.member_id OR old.date<>new.date BEGIN
 UPDATE day_activity SET task_count=task_count-1 WHERE member_id=old.member_id AND date=old.date AND old.deleted_at IS NULL;
 INSERT INTO day_activity(member_id,date,task_count) SELECT new.member_id,new.date,1 WHERE new.deleted_at IS NULL
 ON CONFLICT(member_id,date) DO UPDATE SET task_count=task_count+1;
END;
CREATE TRIGGER entry_activity_insert AFTER INSERT ON entries BEGIN
 INSERT INTO day_activity(member_id,date,has_summary) VALUES(new.member_id,new.date,CASE WHEN trim(new.summary)<>'' THEN 1 ELSE 0 END)
 ON CONFLICT(member_id,date) DO UPDATE SET has_summary=excluded.has_summary;
END;
CREATE TRIGGER entry_activity_update AFTER UPDATE ON entries BEGIN
 UPDATE day_activity SET has_summary=CASE WHEN trim(new.summary)<>'' THEN 1 ELSE 0 END WHERE member_id=new.member_id AND date=new.date;
END;
