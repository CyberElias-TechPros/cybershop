-- CyberShop D1 (SQLite) migration 0001
-- SQLite adaptation of docs/schema.sql. Money columns are INTEGER kobo (NGN minor unit).
-- Timestamps are TEXT in ISO-8601 UTC (e.g. 2026-09-10T14:03:00Z).

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL DEFAULT 'vendor' CHECK (role IN ('admin','vendor','buyer')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  password_reset_token TEXT,
  password_reset_expires TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX uq_users_email ON users(email);
CREATE INDEX ix_users_role ON users(role);

CREATE TABLE user_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  prefs TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  field_schema TEXT NOT NULL,           -- JSON: [{key,label,type,required,options,placeholder,help,order}]
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  logo_media_id INTEGER REFERENCES media(id),
  cover_media_id INTEGER REFERENCES media(id),
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  state_region TEXT,
  website TEXT,
  social TEXT,                            -- JSON
  about TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','pending','verified','rejected')),
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','pending_approval','active','suspended','expired','cancelled','rejected')),
  is_featured INTEGER NOT NULL DEFAULT 0,
  featured_until TEXT,
  settings TEXT,                          -- JSON (storefront theme/sections)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX ix_businesses_owner ON businesses(owner_user_id);
CREATE INDEX ix_businesses_status ON businesses(status);

CREATE TABLE business_categories (
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (business_id, category_id)
);

-- Phase 2 (staff accounts)
CREATE TABLE business_members (
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'manager'
    CHECK (role IN ('manager','sales','catalogue','support','accountant')),
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','removed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (business_id, user_id)
);

CREATE TABLE whatsapp_numbers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  number TEXT NOT NULL,                   -- digits only, e.g. 2348031234567
  label TEXT NOT NULL DEFAULT 'General',
  is_default INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'plan' CHECK (source IN ('plan','add_on')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE (business_id, number)
);
CREATE INDEX ix_wa_business ON whatsapp_numbers(business_id);

CREATE TABLE item_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  url_segment TEXT NOT NULL,
  cta_label TEXT NOT NULL DEFAULT 'Enquire on WhatsApp',
  seo_schema_type TEXT NOT NULL DEFAULT 'Product',
  whatsapp_template_key TEXT NOT NULL DEFAULT 'enquiry',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id),
  item_type_id INTEGER NOT NULL REFERENCES item_types(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  price INTEGER,                          -- kobo (NULL when price_type='negotiable')
  currency TEXT NOT NULL DEFAULT 'NGN',
  price_type TEXT NOT NULL DEFAULT 'fixed' CHECK (price_type IN ('fixed','from','negotiable','free')),
  custom_fields TEXT,                     -- JSON values keyed by category field_schema keys
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  featured INTEGER NOT NULL DEFAULT 0,
  stock_status TEXT NOT NULL DEFAULT 'n_a' CHECK (stock_status IN ('in_stock','out_of_stock','made_to_order','n_a')),
  whatsapp_number_id INTEGER REFERENCES whatsapp_numbers(id),
  published_at TEXT,
  scheduled_publish_at TEXT,
  seo_title TEXT,
  seo_description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE (business_id, slug)
);
CREATE INDEX ix_listings_business_status ON listings(business_id, status);
CREATE INDEX ix_listings_category ON listings(category_id);
CREATE INDEX ix_listings_type ON listings(item_type_id);
CREATE INDEX ix_listings_published ON listings(published_at);

CREATE TABLE media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
  uploaded_by INTEGER REFERENCES users(id),
  driver TEXT NOT NULL DEFAULT 'd1' CHECK (driver IN ('d1','gateway')),
  storage_key TEXT NOT NULL UNIQUE,       -- e.g. media/vendors/1/listings/4/uuid.webp
  d1_blob BLOB,                           -- used when driver='d1'
  original_name TEXT,
  mime_type TEXT NOT NULL,
  extension TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'image' CHECK (kind IN ('image','video','document')),
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  duration INTEGER,
  checksum TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  status TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded','attached','unused','orphaned','deleted')),
  entity_type TEXT,
  entity_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX ix_media_business ON media(business_id, status);
CREATE INDEX ix_media_entity ON media(entity_type, entity_id);

CREATE TABLE item_media (
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0,
  alt_text TEXT,
  PRIMARY KEY (listing_id, media_id)
);
CREATE INDEX ix_im_media ON item_media(media_id);

-- Phase 2
CREATE TABLE listing_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  options TEXT NOT NULL,
  price_override INTEGER,
  stock_qty INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_lv_listing ON listing_variants(listing_id);

CREATE TABLE offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  listing_id INTEGER REFERENCES listings(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  value INTEGER,
  value_type TEXT NOT NULL DEFAULT 'percent' CHECK (value_type IN ('percent','amount','custom')),
  starts_at TEXT,
  ends_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_offers_business ON offers(business_id, is_active);

CREATE TABLE plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  price INTEGER NOT NULL DEFAULT 0,       -- kobo
  currency TEXT NOT NULL DEFAULT 'NGN',
  interval TEXT NOT NULL DEFAULT 'monthly' CHECK (interval IN ('once','monthly','quarterly','yearly')),
  trial_days INTEGER NOT NULL DEFAULT 0,
  quota TEXT NOT NULL,                    -- JSON {max_whatsapp_numbers,max_storage_mb,max_listings,max_categories,max_staff,featured_listings}
  features TEXT,                          -- JSON array of strings
  is_active INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE addons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  type TEXT NOT NULL
    CHECK (type IN ('extra_whatsapp_number','extra_storage','featured_listing','extra_category','staff_account','custom_domain','advanced_analytics')),
  unit TEXT NOT NULL DEFAULT '1',
  price INTEGER NOT NULL,                 -- kobo
  currency TEXT NOT NULL DEFAULT 'NGN',
  duration_days INTEGER NOT NULL DEFAULT 30,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing','active','expiring','expired','grace','cancelled')),
  starts_at TEXT NOT NULL,
  renews_at TEXT,
  expires_at TEXT,
  grace_until TEXT,
  cancel_at_renewal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_sub_business ON subscriptions(business_id, status);
CREATE INDEX ix_sub_expires ON subscriptions(expires_at);

CREATE TABLE vendor_addons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  addon_id INTEGER NOT NULL REFERENCES addons(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled')),
  payment_id INTEGER,
  purchased_at TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_va_business ON vendor_addons(business_id, status);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'activation' CHECK (kind IN ('activation','subscription_renewal','addon')),
  reference TEXT NOT NULL UNIQUE,         -- CS-YYYY-XXXXXX
  plan_id INTEGER REFERENCES plans(id),
  addon_id INTEGER REFERENCES addons(id),
  amount INTEGER NOT NULL,                -- kobo
  currency TEXT NOT NULL DEFAULT 'NGN',
  method TEXT NOT NULL CHECK (method IN ('bank_transfer','paystack','manual')),
  paystack_reference TEXT,
  proof_media_id INTEGER REFERENCES media(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','submitted','reviewing','approved','rejected','refunded','failed')),
  rejection_reason TEXT,
  submitted_at TEXT,
  verified_at TEXT,
  verified_by INTEGER REFERENCES users(id),
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_payments_business ON payments(business_id, status);
CREATE INDEX ix_payments_status ON payments(status, submitted_at);
CREATE INDEX ix_payments_paystack_ref ON payments(paystack_reference);

CREATE TABLE usage_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  day TEXT NOT NULL,                      -- YYYY-MM-DD
  storage_used INTEGER NOT NULL DEFAULT 0,
  listings_pub INTEGER NOT NULL DEFAULT 0,
  wa_clicks INTEGER NOT NULL DEFAULT 0,
  item_views INTEGER NOT NULL DEFAULT 0,
  UNIQUE (business_id, day)
);

CREATE TABLE inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  listing_id INTEGER REFERENCES listings(id),
  whatsapp_number_id INTEGER REFERENCES whatsapp_numbers(id),
  buyer_user_id INTEGER REFERENCES users(id),
  buyer_name TEXT,
  buyer_phone TEXT,
  message TEXT,
  wa_url TEXT,
  source TEXT NOT NULL DEFAULT 'item_page' CHECK (source IN ('item_page','storefront','search','cart')),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','contacted','interested','negotiating','converted','lost')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_inq_business ON inquiries(business_id, status, created_at);
CREATE INDEX ix_inq_listing ON inquiries(listing_id);
CREATE INDEX ix_inq_buyer ON inquiries(buyer_user_id);

CREATE TABLE favorites (
  buyer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (buyer_user_id, listing_id)
);
CREATE INDEX ix_fav_listing ON favorites(listing_id);

CREATE TABLE recent_views (
  buyer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (buyer_user_id, listing_id)
);
CREATE INDEX ix_rv_listing ON recent_views(listing_id);

CREATE TABLE message_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
  item_type_id INTEGER REFERENCES item_types(id),
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_mt_lookup ON message_templates(business_id, item_type_id, is_active);

CREATE TABLE analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('storefront_view','item_view','wa_click','search','add_to_favorites')),
  listing_id INTEGER,
  buyer_user_id INTEGER,
  session_id TEXT NOT NULL,
  ip_hash TEXT,
  user_agent TEXT,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_an_business_day ON analytics_events(business_id, event_type, created_at);
CREATE INDEX ix_an_listing ON analytics_events(listing_id);

CREATE TABLE analytics_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  storefront_views INTEGER NOT NULL DEFAULT 0,
  item_views INTEGER NOT NULL DEFAULT 0,
  wa_clicks INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  UNIQUE (business_id, day)
);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_user_id INTEGER REFERENCES users(id),
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','dismissed')),
  resolved_by INTEGER REFERENCES users(id),
  resolution_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_reports_status ON reports(status);
CREATE INDEX ix_reports_entity ON reports(entity_type, entity_id);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER NOT NULL REFERENCES users(id),
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  ip TEXT,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_audit_actor ON audit_logs(actor_user_id, created_at);
CREATE INDEX ix_audit_entity ON audit_logs(entity_type, entity_id);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_notif_user ON notifications(user_id, read_at, created_at);

CREATE TABLE platform_settings (
  skey TEXT PRIMARY KEY,
  svalue TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  last_activity INTEGER NOT NULL
);
CREATE INDEX ix_sessions_user ON sessions(user_id);

-- simple sliding-window rate limiter
CREATE TABLE rate_limits (
  bucket TEXT PRIMARY KEY,                -- {key}:{scope}:{window-start}
  count INTEGER NOT NULL DEFAULT 0
);

-- short-lived signed upload tokens for the media gateway
CREATE TABLE upload_tokens (
  token TEXT PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  path_prefix TEXT NOT NULL,              -- e.g. media/vendors/1/listings/4/
  allowed_mime TEXT NOT NULL,
  max_bytes INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,            -- unix seconds
  used_at INTEGER
);
