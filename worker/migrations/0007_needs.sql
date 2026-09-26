-- Saved stores, vendor referrals, and storefront settings live in existing JSON.

ALTER TABLE users ADD COLUMN referral_code TEXT;
ALTER TABLE users ADD COLUMN referral_credit_kobo INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_referral_code ON users(referral_code) WHERE referral_code IS NOT NULL;

ALTER TABLE businesses ADD COLUMN referred_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE businesses ADD COLUMN referral_rewarded_at TEXT;

CREATE TABLE IF NOT EXISTS saved_businesses (
  buyer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (buyer_user_id, business_id)
);
CREATE INDEX IF NOT EXISTS ix_saved_biz ON saved_businesses(business_id);
