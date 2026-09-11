-- 0003: allow system actors in audit_logs (webhooks / cron have no user id).
-- SQLite cannot ALTER a column's NULLability, so rebuild the table.
-- All existing rows reference real users, so the FK stays satisfied.

CREATE TABLE audit_logs_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER REFERENCES users(id),
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  ip TEXT,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO audit_logs_new (id, actor_user_id, actor_role, action, entity_type, entity_id, ip, meta, created_at)
  SELECT id, actor_user_id, actor_role, action, entity_type, entity_id, ip, meta, created_at FROM audit_logs;

DROP TABLE audit_logs;
ALTER TABLE audit_logs_new RENAME TO audit_logs;

CREATE INDEX ix_audit_actor ON audit_logs(actor_user_id, created_at);
CREATE INDEX ix_audit_entity ON audit_logs(entity_type, entity_id);
