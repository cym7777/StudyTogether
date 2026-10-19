-- One indexed row makes idle polling independent of history size.
CREATE TABLE sync_state(id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0);
INSERT INTO sync_state VALUES(1,0);
CREATE TRIGGER sync_members_insert AFTER INSERT ON members BEGIN UPDATE sync_state SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER sync_members_update AFTER UPDATE ON members BEGIN UPDATE sync_state SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER sync_members_delete AFTER DELETE ON members BEGIN UPDATE sync_state SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER sync_settings_update AFTER UPDATE ON settings BEGIN UPDATE sync_state SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER sync_subjects_insert AFTER INSERT ON subjects BEGIN UPDATE sync_state SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER sync_subjects_update AFTER UPDATE ON subjects BEGIN UPDATE sync_state SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER sync_subjects_delete AFTER DELETE ON subjects BEGIN UPDATE sync_state SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER sync_entries_insert AFTER INSERT ON entries BEGIN UPDATE sync_state SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER sync_entries_update AFTER UPDATE ON entries BEGIN UPDATE sync_state SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER sync_entries_delete AFTER DELETE ON entries BEGIN UPDATE sync_state SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER sync_tasks_insert AFTER INSERT ON tasks BEGIN UPDATE sync_state SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER sync_tasks_update AFTER UPDATE ON tasks BEGIN UPDATE sync_state SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER sync_tasks_delete AFTER DELETE ON tasks BEGIN UPDATE sync_state SET revision=revision+1 WHERE id=1; END;
