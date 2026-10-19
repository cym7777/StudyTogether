-- Audit-only restores also invalidate an in-progress paged backup.
CREATE TRIGGER sync_revisions_insert AFTER INSERT ON revisions BEGIN UPDATE sync_state SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER sync_revisions_update AFTER UPDATE ON revisions BEGIN UPDATE sync_state SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER sync_revisions_delete AFTER DELETE ON revisions BEGIN UPDATE sync_state SET revision=revision+1 WHERE id=1; END;
