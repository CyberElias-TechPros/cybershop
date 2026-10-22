-- Durable delivery/operations. No plaintext email addresses, tokens or bodies in outbox metadata.
CREATE TABLE email_outbox (
  id TEXT PRIMARY KEY,
  payload TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','sent','dead','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  lock_token TEXT,
  locked_until INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX ix_outbox_dispatch ON email_outbox(status, available_at, locked_until);
CREATE INDEX ix_outbox_retention ON email_outbox(created_at);

CREATE TABLE job_leases (
  name TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE cron_runs (
  id TEXT PRIMARY KEY,
  job TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  summary TEXT
);
CREATE INDEX ix_cron_runs ON cron_runs(job, started_at);

CREATE TABLE public_snapshots (
  name TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
