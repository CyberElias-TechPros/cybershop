-- Vendor pause does not change businesses.status (the CHECK stays).
-- A paused store stays in the database and the dashboard, but leaves the market.
ALTER TABLE businesses ADD COLUMN paused_at TEXT;
