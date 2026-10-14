-- 0014_platform_growth: FTS5 search, saved-item change alerts, API keys,
-- support tickets, staff business switching.
-- Applied by scripts/bootstrap-dev.sh locally and wrangler in production.

-- Full-text search index over listings (kept in sync by triggers below;
-- search joins back to listings so status/soft-delete filters always apply).
CREATE VIRTUAL TABLE IF NOT EXISTS listings_fts USING fts5(name, description, business_name, city);
INSERT INTO listings_fts (rowid, name, description, business_name, city)
SELECT l.id, l.name, COALESCE(l.description, ''), b.name, COALESCE(b.city, '')
FROM listings l JOIN businesses b ON b.id = l.business_id
WHERE l.deleted_at IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_listings_fts_ai AFTER INSERT ON listings BEGIN
  INSERT INTO listings_fts (rowid, name, description, business_name, city)
  SELECT NEW.id, NEW.name, COALESCE(NEW.description, ''),
    (SELECT name FROM businesses WHERE id = NEW.business_id),
    (SELECT COALESCE(city, '') FROM businesses WHERE id = NEW.business_id)
  WHERE NEW.deleted_at IS NULL;
END;
CREATE TRIGGER IF NOT EXISTS trg_listings_fts_au AFTER UPDATE OF name, description, business_id, deleted_at ON listings BEGIN
  DELETE FROM listings_fts WHERE rowid = OLD.id;
  INSERT INTO listings_fts (rowid, name, description, business_name, city)
  SELECT NEW.id, NEW.name, COALESCE(NEW.description, ''),
    (SELECT name FROM businesses WHERE id = NEW.business_id),
    (SELECT COALESCE(city, '') FROM businesses WHERE id = NEW.business_id)
  WHERE NEW.deleted_at IS NULL;
END;
CREATE TRIGGER IF NOT EXISTS trg_listings_fts_ad AFTER DELETE ON listings BEGIN
  DELETE FROM listings_fts WHERE rowid = OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_biz_fts_au AFTER UPDATE OF name, city ON businesses BEGIN
  UPDATE listings_fts SET business_name = NEW.name, city = COALESCE(NEW.city, '')
  WHERE rowid IN (SELECT id FROM listings WHERE business_id = NEW.id);
END;

-- Saved-item snapshots: cron compares these to catch price drops / restocks.
ALTER TABLE favorites ADD COLUMN price_snapshot INTEGER;
ALTER TABLE favorites ADD COLUMN stock_snapshot TEXT;
UPDATE favorites SET price_snapshot = (SELECT price FROM listings WHERE id = favorites.listing_id),
  stock_snapshot = (SELECT stock_status FROM listings WHERE id = favorites.listing_id);

-- Read-only API keys for power sellers (hashed at rest, shown once on create).
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_api_keys_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;

-- Support tickets (contact becomes a tracked thread, not a lost email).
CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  email TEXT NOT NULL,
  name TEXT,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author TEXT NOT NULL CHECK (author IN ('user','admin')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_support_status ON support_tickets(status, updated_at);

-- Which business a multi-seat staff user is currently acting on.
CREATE TABLE IF NOT EXISTS user_active_business (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
