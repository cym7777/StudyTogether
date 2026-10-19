PRAGMA foreign_keys = ON;
CREATE TABLE members (
 id TEXT PRIMARY KEY CHECK(id IN ('member-1','member-2','member-3')),
 name TEXT NOT NULL, color TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL
);
INSERT INTO members VALUES
 ('member-1','同学一','#6a9ec9',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('member-2','同学二','#68aa93',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('member-3','同学三','#d69a65',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id=1), exam_date TEXT, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);
INSERT INTO settings VALUES(1,NULL,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE subjects (name TEXT PRIMARY KEY, created_at TEXT NOT NULL);
INSERT INTO subjects VALUES ('数学',CURRENT_TIMESTAMP),('英语',CURRENT_TIMESTAMP),('政治',CURRENT_TIMESTAMP),('专业课',CURRENT_TIMESTAMP),('其他',CURRENT_TIMESTAMP);
CREATE TABLE entries (
 member_id TEXT NOT NULL REFERENCES members(id), date TEXT NOT NULL,
 summary TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL,
 PRIMARY KEY(member_id,date)
);
CREATE TABLE tasks (
 id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), date TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('done','plan')), subject TEXT NOT NULL REFERENCES subjects(name),
 text TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 deleted_at TEXT, source_plan_id TEXT REFERENCES tasks(id)
);
CREATE INDEX tasks_day ON tasks(member_id,date,kind,deleted_at);
CREATE UNIQUE INDEX tasks_conversion ON tasks(source_plan_id,date) WHERE source_plan_id IS NOT NULL;
CREATE TABLE revisions (id INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT NOT NULL, entity_key TEXT NOT NULL, before_json TEXT NOT NULL, changed_at TEXT NOT NULL);
CREATE INDEX revisions_key ON revisions(entity,entity_key,id);
CREATE TRIGGER task_history BEFORE UPDATE ON tasks BEGIN
 INSERT INTO revisions(entity,entity_key,before_json,changed_at) VALUES('task',old.id,json_object('id',old.id,'member_id',old.member_id,'date',old.date,'kind',old.kind,'subject',old.subject,'text',old.text,'deleted_at',old.deleted_at,'version',old.version),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER entry_history BEFORE UPDATE ON entries BEGIN
 INSERT INTO revisions(entity,entity_key,before_json,changed_at) VALUES('summary',old.member_id||':'||old.date,json_object('summary',old.summary,'version',old.version),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER member_history BEFORE UPDATE ON members BEGIN
 INSERT INTO revisions(entity,entity_key,before_json,changed_at) VALUES('member',old.id,json_object('name',old.name,'color',old.color,'version',old.version),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE VIEW active_days AS
 SELECT member_id,date FROM entries WHERE trim(summary) <> ''
 UNION SELECT member_id,date FROM tasks WHERE deleted_at IS NULL;
