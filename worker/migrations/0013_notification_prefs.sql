-- 0013 · Notification preferences
--
-- Two channels, per notification category, per user.
--
-- In-app is the record of what happened and is never switched off — it is also
-- how the bell badge is counted. Email is the channel people actually mute when
-- a marketplace gets noisy, and once muted they stop seeing the product at all.
-- So each category is a pair, and the defaults are deliberately quiet:
-- money and access always email, leads email too (that is the income), and
-- everything else is in-app only until the user asks for more.

CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,          -- see lib/notifyprefs.ts CATEGORIES
  in_app INTEGER NOT NULL DEFAULT 1,
  email INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, category)
);
