-- 0010 · Platform entitlement
--
-- A plan that is granted to a business permanently, at no cost, and that never
-- expires. It exists for one reason: CyberShop is Cyber Elias Academy's own
-- platform, so CEA's store must always sit on the highest package without ever
-- being invoiced, chased or expired.
--
-- The entitlement is materialised two ways so no code path can miss it:
--   1. `businesses.plan_override` is the source of truth (read by quotas,
--      billing and the admin UI).
--   2. A real `subscriptions` row with `expires_at = NULL` is kept in sync, so
--      every existing screen that reads the subscription (dashboard, admin,
--      storefront gating) sees the granted plan without special-casing.
--      The hourly cron skips `expires_at IS NULL` rows, so it can never expire.

ALTER TABLE businesses ADD COLUMN plan_override TEXT NULL;
ALTER TABLE businesses ADD COLUMN plan_override_reason TEXT NULL;
ALTER TABLE businesses ADD COLUMN plan_override_by BIGINT UNSIGNED NULL;
ALTER TABLE businesses ADD COLUMN plan_override_at DATETIME NULL;

-- Marks the platform owner's own store: always verified, always featured,
-- never billed. Surfaced on the storefront as the official-store badge.
ALTER TABLE businesses ADD COLUMN is_platform_owner TINYINT(1) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ix_businesses_override ON businesses(plan_override);
