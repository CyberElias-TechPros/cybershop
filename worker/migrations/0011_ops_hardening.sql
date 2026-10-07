-- 0011 · Ops hardening
--
-- Everything in this migration is additive. It backs the four operational gaps
-- that sat between "the app works" and "the app can be run": reports that get
-- worked rather than piled, money that gets reconciled, admins behind a second
-- factor, and errors that reach a human.

-- ---------------------------------------------------------------------------
-- 1. Reports: a queue with an owner and a clock
-- ---------------------------------------------------------------------------
ALTER TABLE reports ADD COLUMN assignee_user_id INTEGER REFERENCES users(id);
ALTER TABLE reports ADD COLUMN resolution TEXT;          -- no_action|warning_sent|content_removed|store_suspended|reporter_unfounded
ALTER TABLE reports ADD COLUMN resolved_at TEXT;
-- Every report is answered within this window. The cron warns when one is not.
ALTER TABLE reports ADD COLUMN sla_due_at TEXT;
ALTER TABLE reports ADD COLUMN sla_breached_at TEXT;
-- Set when an admin first touches it, so "time to first response" is knowable.
ALTER TABLE reports ADD COLUMN triaged_at TEXT;
CREATE INDEX IF NOT EXISTS ix_reports_assignee ON reports(assignee_user_id, status);
CREATE INDEX IF NOT EXISTS ix_reports_sla ON reports(sla_due_at, status);

-- ---------------------------------------------------------------------------
-- 2. Server errors, so they can be counted and alerted on
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,                 -- 'api' | 'cron' | 'webhook'
  route TEXT,
  status INTEGER,
  code TEXT,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_error_log_created ON error_log(created_at);
CREATE INDEX IF NOT EXISTS ix_error_log_scope ON error_log(scope, created_at);

-- One row per alert rule, so a noisy hour alerts once instead of every minute.
CREATE TABLE IF NOT EXISTS alert_state (
  alert_key TEXT PRIMARY KEY,
  last_sent_at TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- 3. Two-factor authentication for accounts that hold money or power
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN totp_secret TEXT;           -- active secret (base32)
ALTER TABLE users ADD COLUMN totp_pending_secret TEXT;  -- enrolled, not yet confirmed
ALTER TABLE users ADD COLUMN totp_enabled_at TEXT;
-- JSON array of {code_hash, used_at}. Ten single-use codes, hashed at rest.
ALTER TABLE users ADD COLUMN totp_backup_codes TEXT;
ALTER TABLE users ADD COLUMN totp_last_counter INTEGER;

-- ---------------------------------------------------------------------------
-- 4. Sessions: visible, revocable devices
-- ---------------------------------------------------------------------------
ALTER TABLE sessions ADD COLUMN created_at TEXT;
ALTER TABLE sessions ADD COLUMN user_agent TEXT;
ALTER TABLE sessions ADD COLUMN ip_hash TEXT;
CREATE INDEX IF NOT EXISTS ix_sessions_activity ON sessions(last_activity);
