-- Buyer account, staff invites, reviews, blocks, custom domains,
-- WhatsApp routing, lead follow-ups, deposit refund requests.
-- Additive only — existing rows keep working.

ALTER TABLE users ADD COLUMN email_verified_at TEXT;
ALTER TABLE users ADD COLUMN email_verify_token TEXT;
ALTER TABLE users ADD COLUMN email_verify_expires TEXT;

ALTER TABLE inquiries ADD COLUMN follow_up_at TEXT;
ALTER TABLE inquiries ADD COLUMN follow_up_notified_at TEXT;
ALTER TABLE inquiries ADD COLUMN variant_label TEXT;

ALTER TABLE businesses ADD COLUMN custom_domain TEXT;
ALTER TABLE businesses ADD COLUMN custom_domain_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE businesses ADD COLUMN custom_domain_token TEXT;

ALTER TABLE whatsapp_numbers ADD COLUMN route_category_id INTEGER;
ALTER TABLE whatsapp_numbers ADD COLUMN route_item_type_id INTEGER;

ALTER TABLE deposits ADD COLUMN refund_requested INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_businesses_domain ON businesses(custom_domain);

CREATE TABLE IF NOT EXISTS blocks (
  buyer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (buyer_user_id, business_id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  buyer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  inquiry_id INTEGER REFERENCES inquiries(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden')),
  vendor_reply TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_reviews_biz ON reviews(business_id, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_review_listing ON reviews(buyer_user_id, listing_id) WHERE listing_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_review_business ON reviews(buyer_user_id, business_id) WHERE listing_id IS NULL;

CREATE TABLE IF NOT EXISTS staff_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager','sales','catalogue','support','accountant')),
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_staff_invites_biz ON staff_invites(business_id, email);

-- Sold in the plan, previously a type with no row vendors could buy.
INSERT INTO addons (name, slug, description, type, unit, price, duration_days, sort_order)
SELECT 'Custom domain', 'custom-domain', 'Serve your storefront on your own domain (you add the DNS record; TLS is attached when a Vercel token is configured).', 'custom_domain', '1', 2500000, 365, 16
WHERE NOT EXISTS (SELECT 1 FROM addons WHERE slug = 'custom-domain');
