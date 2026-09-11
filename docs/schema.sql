-- ============================================================================
-- CyberShop — Database schema (MySQL 8 / MariaDB 10.6+ compatible)
-- Phase 1 (MVP) core + Phase-2-ready tables marked [P2].
-- Convention: InnoDB, utf8mb4, snake_case, created_at/updated_at everywhere,
-- soft delete (deleted_at) on core business entities.
-- ============================================================================

SET NAMES utf8mb4;

-- ----------------------------------------------------------------------------
-- IDENTITY
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role          ENUM('admin','vendor','buyer') NOT NULL DEFAULT 'vendor',
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  phone         VARCHAR(30)  NULL,
  password_hash VARCHAR(255) NOT NULL,
  status        ENUM('active','suspended','deleted') NOT NULL DEFAULT 'active',
  last_login_at DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email(190)),
  KEY ix_users_role (role)
) ENGINE=InnoDB;

CREATE TABLE user_settings (
  user_id      BIGINT UNSIGNED NOT NULL,
  prefs        JSON NULL,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_us_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- BUSINESS
-- ----------------------------------------------------------------------------
CREATE TABLE categories (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(120) NOT NULL,
  slug          VARCHAR(140) NOT NULL,
  description   TEXT NULL,
  icon          VARCHAR(80) NULL,                 -- icon key or emoji
  field_schema  JSON NOT NULL,                     -- [{key,label,type,required,options,placeholder,help,order}]
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_slug (slug)
) ENGINE=InnoDB;

CREATE TABLE businesses (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_user_id    BIGINT UNSIGNED NOT NULL,
  name             VARCHAR(160) NOT NULL,
  slug             VARCHAR(170) NOT NULL,
  description      TEXT NULL,
  logo_media_id    BIGINT UNSIGNED NULL,
  cover_media_id   BIGINT UNSIGNED NULL,
  phone            VARCHAR(30) NULL,
  email            VARCHAR(190) NULL,
  address          VARCHAR(255) NULL,
  city             VARCHAR(120) NULL,
  state_region     VARCHAR(120) NULL,
  website          VARCHAR(255) NULL,
  social           JSON NULL,                      -- {facebook,instagram,x,threads,tiktok}
  about            TEXT NULL,
  verification_status ENUM('unverified','pending','verified','rejected') NOT NULL DEFAULT 'unverified',
  status           ENUM('pending_payment','pending_approval','active','suspended','expired','cancelled','rejected')
                   NOT NULL DEFAULT 'pending_payment',
  is_featured      TINYINT(1) NOT NULL DEFAULT 0,
  featured_until   DATETIME NULL,
  settings         JSON NULL,                       -- storefront theme, colors, sections, message tweaks
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at       DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_businesses_slug (slug(190)),
  KEY ix_businesses_owner (owner_user_id),
  KEY ix_businesses_status (status),
  CONSTRAINT fk_business_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE business_categories (
  business_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (business_id, category_id),
  CONSTRAINT fk_bc_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_bc_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Phase 2: team members (staff accounts = monetized add-on)
CREATE TABLE business_members (
  business_id BIGINT UNSIGNED NOT NULL,
  user_id     BIGINT UNSIGNED NOT NULL,
  role        ENUM('manager','sales','catalogue','support','accountant') NOT NULL DEFAULT 'manager',
  status      ENUM('invited','active','removed') NOT NULL DEFAULT 'invited',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_id, user_id)
) ENGINE=InnoDB;

CREATE TABLE whatsapp_numbers (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id BIGINT UNSIGNED NOT NULL,
  number      VARCHAR(30) NOT NULL,                -- E.164 without '+', e.g. 2348031234567
  label       VARCHAR(80) NOT NULL DEFAULT 'General',
  is_default  TINYINT(1) NOT NULL DEFAULT 0,
  source      ENUM('plan','add_on') NOT NULL DEFAULT 'plan',
  status      ENUM('active','disabled') NOT NULL DEFAULT 'active',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wa_number (business_id, number),
  KEY ix_wa_business (business_id),
  CONSTRAINT fk_wa_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- CATALOGUE
-- ----------------------------------------------------------------------------
CREATE TABLE item_types (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name           VARCHAR(100) NOT NULL,            -- "Product", "Service", "Course", "Event", "Property", "Digital Product"
  slug           VARCHAR(110) NOT NULL,
  url_segment    VARCHAR(60) NOT NULL,             -- /business/{b}/products/{item}
  cta_label      VARCHAR(80) NOT NULL DEFAULT 'Enquire on WhatsApp',
  seo_schema_type VARCHAR(40) NOT NULL DEFAULT 'Product',  -- Product|Service|Course|Event|…
  whatsapp_template_key VARCHAR(60) NOT NULL DEFAULT 'enquiry',
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_item_types_slug (slug)
) ENGINE=InnoDB;

CREATE TABLE listings (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id        BIGINT UNSIGNED NOT NULL,
  category_id        BIGINT UNSIGNED NULL,         -- industry (drives field schema)
  item_type_id       BIGINT UNSIGNED NOT NULL,
  name               VARCHAR(200) NOT NULL,
  slug               VARCHAR(210) NOT NULL,
  description        TEXT NULL,
  price              DECIMAL(14,2) NULL,
  currency           CHAR(3) NOT NULL DEFAULT 'NGN',
  price_type         ENUM('fixed','from','negotiable','free') NOT NULL DEFAULT 'fixed',
  custom_fields      JSON NULL,                    -- values keyed by category field_schema keys
  status             ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  featured           TINYINT(1) NOT NULL DEFAULT 0,
  stock_status       ENUM('in_stock','out_of_stock','made_to_order','n_a') NOT NULL DEFAULT 'n_a',
  whatsapp_number_id BIGINT UNSIGNED NULL,         -- per-item routing override → business default
  published_at       DATETIME NULL,
  scheduled_publish_at DATETIME NULL,
  seo_title          VARCHAR(200) NULL,
  seo_description    VARCHAR(300) NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at         DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_listing_slug (business_id, slug(190)),
  KEY ix_listings_business_status (business_id, status),
  KEY ix_listings_category (category_id),
  KEY ix_listings_type (item_type_id),
  KEY ix_listings_published (published_at),
  CONSTRAINT fk_listing_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_listing_category FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT fk_listing_type FOREIGN KEY (item_type_id) REFERENCES item_types(id),
  CONSTRAINT fk_listing_wa FOREIGN KEY (whatsapp_number_id) REFERENCES whatsapp_numbers(id)
) ENGINE=InnoDB;

CREATE TABLE media (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id     BIGINT UNSIGNED NULL,            -- NULL = platform asset
  uploaded_by     BIGINT UNSIGNED NULL,
  storage_key     VARCHAR(255) NOT NULL,           -- e.g. media/vendors/{bid}/listings/{lid}/uuid.webp
  original_name   VARCHAR(255) NULL,
  mime_type       VARCHAR(100) NOT NULL,
  extension       VARCHAR(10) NOT NULL,
  kind            ENUM('image','video','document') NOT NULL DEFAULT 'image',
  size_bytes      BIGINT UNSIGNED NOT NULL,
  width           INT UNSIGNED NULL,
  height          INT UNSIGNED NULL,
  duration        INT UNSIGNED NULL,               -- seconds, video
  checksum        CHAR(64) NULL,                   -- sha256
  visibility      ENUM('public','private') NOT NULL DEFAULT 'public',
  status          ENUM('uploaded','attached','unused','orphaned','deleted') NOT NULL DEFAULT 'uploaded',
  entity_type     VARCHAR(40) NULL,                -- 'listing' | 'business' | 'payment' | 'user'
  entity_id       BIGINT UNSIGNED NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_media_storage_key (storage_key),
  KEY ix_media_business (business_id, status),
  KEY ix_media_entity (entity_type, entity_id),
  CONSTRAINT fk_media_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_media_user FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE item_media (
  listing_id BIGINT UNSIGNED NOT NULL,
  media_id   BIGINT UNSIGNED NOT NULL,
  position   INT NOT NULL DEFAULT 0,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  alt_text   VARCHAR(255) NULL,
  PRIMARY KEY (listing_id, media_id),
  KEY ix_im_media (media_id),
  CONSTRAINT fk_im_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  CONSTRAINT fk_im_media FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Phase 2: variants (Size/Colour) and offers
CREATE TABLE listing_variants (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  listing_id BIGINT UNSIGNED NOT NULL,
  name       VARCHAR(120) NOT NULL,                -- "Black / Large"
  options    JSON NOT NULL,                        -- {colour:"Black", size:"Large"}
  price_override DECIMAL(14,2) NULL,
  stock_qty  INT NULL,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_lv_listing (listing_id),
  CONSTRAINT fk_lv_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE offers (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id BIGINT UNSIGNED NOT NULL,
  listing_id  BIGINT UNSIGNED NULL,
  kind        ENUM('discount','bundle','clearance','featured','new_arrival','limited_time') NOT NULL,
  title       VARCHAR(160) NOT NULL,
  description TEXT NULL,
  value       DECIMAL(14,2) NULL,
  value_type  ENUM('percent','amount','custom') NOT NULL DEFAULT 'percent',
  starts_at   DATETIME NULL,
  ends_at     DATETIME NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_offers_business (business_id, is_active),
  CONSTRAINT fk_offers_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- BILLING (plans + add-ons + payment intents)
-- ----------------------------------------------------------------------------
CREATE TABLE plans (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name         VARCHAR(100) NOT NULL,
  slug         VARCHAR(110) NOT NULL,
  description  TEXT NULL,
  price        DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency     CHAR(3) NOT NULL DEFAULT 'NGN',
  interval     ENUM('once','monthly','quarterly','yearly') NOT NULL DEFAULT 'monthly',
  trial_days   INT NOT NULL DEFAULT 0,
  quota        JSON NOT NULL,            -- {max_whatsapp_numbers, max_storage_mb, max_listings, max_categories, max_staff, featured_listings}
  features     JSON NULL,                -- marketing bullets
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  is_default   TINYINT(1) NOT NULL DEFAULT 0,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plans_slug (slug)
) ENGINE=InnoDB;

CREATE TABLE addons (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(120) NOT NULL,
  slug        VARCHAR(130) NOT NULL,
  description TEXT NULL,
  type        ENUM('extra_whatsapp_number','extra_storage','featured_listing','extra_category',
                   'staff_account','custom_domain','advanced_analytics') NOT NULL,
  unit        VARCHAR(40) NOT NULL DEFAULT '1',    -- "1", "10GB", …
  price       DECIMAL(14,2) NOT NULL,
  currency    CHAR(3) NOT NULL DEFAULT 'NGN',
  duration_days INT NOT NULL DEFAULT 30,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_addons_slug (slug)
) ENGINE=InnoDB;

CREATE TABLE subscriptions (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id     BIGINT UNSIGNED NOT NULL,
  plan_id         BIGINT UNSIGNED NOT NULL,
  status          ENUM('trialing','active','expiring','expired','grace','cancelled') NOT NULL DEFAULT 'trialing',
  starts_at       DATETIME NOT NULL,
  renews_at       DATETIME NULL,
  expires_at      DATETIME NULL,
  grace_until     DATETIME NULL,
  cancel_at_renewal TINYINT(1) NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_sub_business (business_id, status),
  KEY ix_sub_expires (expires_at),
  CONSTRAINT fk_sub_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_plan FOREIGN KEY (plan_id) REFERENCES plans(id)
) ENGINE=InnoDB;

CREATE TABLE vendor_addons (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id BIGINT UNSIGNED NOT NULL,
  addon_id    BIGINT UNSIGNED NOT NULL,
  quantity    INT NOT NULL DEFAULT 1,
  status      ENUM('active','expired','cancelled') NOT NULL DEFAULT 'active',
  payment_id  BIGINT UNSIGNED NULL,
  purchased_at DATETIME NOT NULL,
  expires_at  DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_va_business (business_id, status),
  CONSTRAINT fk_va_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_va_addon FOREIGN KEY (addon_id) REFERENCES addons(id)
) ENGINE=InnoDB;

CREATE TABLE payments (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id        BIGINT UNSIGNED NOT NULL,
  kind               ENUM('activation','subscription_renewal','addon') NOT NULL DEFAULT 'activation',
  reference          VARCHAR(40) NOT NULL,           -- platform reference, e.g. CS-2026-XXXXXX
  plan_id            BIGINT UNSIGNED NULL,
  addon_id           BIGINT UNSIGNED NULL,
  amount             DECIMAL(14,2) NOT NULL,
  currency           CHAR(3) NOT NULL DEFAULT 'NGN',
  method             ENUM('bank_transfer','paystack','manual') NOT NULL,
  paystack_reference VARCHAR(80) NULL,               -- Paystack transaction reference (webhook)
  proof_media_id     BIGINT UNSIGNED NULL,           -- bank transfer proof (private media)
  status             ENUM('pending','submitted','reviewing','approved','rejected','refunded','failed')
                     NOT NULL DEFAULT 'pending',
  rejection_reason   TEXT NULL,
  submitted_at       DATETIME NULL,
  verified_at        DATETIME NULL,
  verified_by        BIGINT UNSIGNED NULL,           -- NULL when auto-approved via Paystack
  metadata           JSON NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_reference (reference),
  KEY ix_payments_business (business_id, status),
  KEY ix_payments_status (status, submitted_at),
  KEY ix_payments_paystack_ref (paystack_reference),
  CONSTRAINT fk_pay_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_pay_plan FOREIGN KEY (plan_id) REFERENCES plans(id),
  CONSTRAINT fk_pay_addon FOREIGN KEY (addon_id) REFERENCES addons(id),
  CONSTRAINT fk_pay_proof FOREIGN KEY (proof_media_id) REFERENCES media(id),
  CONSTRAINT fk_pay_verifier FOREIGN KEY (verified_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE usage_snapshots (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id   BIGINT UNSIGNED NOT NULL,
  day           DATE NOT NULL,
  storage_used  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  listings_pub  INT NOT NULL DEFAULT 0,
  wa_clicks     INT NOT NULL DEFAULT 0,
  item_views    INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usage_day (business_id, day),
  CONSTRAINT fk_usage_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- BUYER SIDE
-- ----------------------------------------------------------------------------
CREATE TABLE inquiries (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id        BIGINT UNSIGNED NOT NULL,
  listing_id         BIGINT UNSIGNED NULL,
  whatsapp_number_id BIGINT UNSIGNED NULL,
  buyer_user_id      BIGINT UNSIGNED NULL,
  buyer_name         VARCHAR(120) NULL,
  buyer_phone        VARCHAR(30) NULL,
  message            TEXT NULL,                     -- the exact prefilled message sent
  wa_url             VARCHAR(500) NULL,
  source             ENUM('item_page','storefront','search','cart') NOT NULL DEFAULT 'item_page',
  status             ENUM('new','contacted','interested','negotiating','converted','lost') NOT NULL DEFAULT 'new',
  note               TEXT NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_inq_business (business_id, status, created_at),
  KEY ix_inq_listing (listing_id),
  KEY ix_inq_buyer (buyer_user_id),
  CONSTRAINT fk_inq_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_inq_listing FOREIGN KEY (listing_id) REFERENCES listings(id),
  CONSTRAINT fk_inq_wa FOREIGN KEY (whatsapp_number_id) REFERENCES whatsapp_numbers(id),
  CONSTRAINT fk_inq_buyer FOREIGN KEY (buyer_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE favorites (
  buyer_user_id BIGINT UNSIGNED NOT NULL,
  listing_id    BIGINT UNSIGNED NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (buyer_user_id, listing_id),
  KEY ix_fav_listing (listing_id),
  CONSTRAINT fk_fav_user FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_fav_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE recent_views (
  buyer_user_id BIGINT UNSIGNED NOT NULL,
  listing_id    BIGINT UNSIGNED NOT NULL,
  viewed_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (buyer_user_id, listing_id),
  KEY ix_rv_listing (listing_id),
  CONSTRAINT fk_rv_user FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rv_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- WHATSAPP TEMPLATES
-- ----------------------------------------------------------------------------
CREATE TABLE message_templates (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id     BIGINT UNSIGNED NULL,             -- NULL = platform default
  item_type_id    BIGINT UNSIGNED NULL,             -- NULL = generic
  name            VARCHAR(100) NOT NULL,
  body            TEXT NOT NULL,                    -- {{business_name}} {{item_name}} {{price}} {{quantity}} {{item_url}} …
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_mt_lookup (business_id, item_type_id, is_active),
  CONSTRAINT fk_mt_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_mt_type FOREIGN KEY (item_type_id) REFERENCES item_types(id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- ANALYTICS
-- ----------------------------------------------------------------------------
CREATE TABLE analytics_events (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id BIGINT UNSIGNED NOT NULL,
  event_type  ENUM('storefront_view','item_view','wa_click','search','add_to_favorites') NOT NULL,
  listing_id  BIGINT UNSIGNED NULL,
  buyer_user_id BIGINT UNSIGNED NULL,
  session_id  CHAR(40) NOT NULL,
  ip_hash     CHAR(64) NULL,                        -- salted hash, no raw IPs
  user_agent  VARCHAR(255) NULL,
  meta        JSON NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_an_business_day (business_id, event_type, created_at),
  KEY ix_an_listing (listing_id),
  CONSTRAINT fk_an_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE analytics_daily (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id   BIGINT UNSIGNED NOT NULL,
  day           DATE NOT NULL,
  storefront_views INT NOT NULL DEFAULT 0,
  item_views    INT NOT NULL DEFAULT 0,
  wa_clicks     INT NOT NULL DEFAULT 0,
  unique_visitors INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_an_daily (business_id, day),
  CONSTRAINT fk_an_daily_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- MODERATION / AUDIT / NOTIFICATIONS / SETTINGS
-- ----------------------------------------------------------------------------
CREATE TABLE reports (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reporter_user_id BIGINT UNSIGNED NULL,
  entity_type     VARCHAR(40) NOT NULL,             -- 'business' | 'listing' | 'media' | 'user'
  entity_id       BIGINT UNSIGNED NOT NULL,
  reason          VARCHAR(120) NOT NULL,            -- spam|fraud|misleading|abusive|other
  details         TEXT NULL,
  status          ENUM('open','investigating','resolved','dismissed') NOT NULL DEFAULT 'open',
  resolved_by     BIGINT UNSIGNED NULL,
  resolution_note TEXT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_reports_status (status),
  KEY ix_reports_entity (entity_type, entity_id),
  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_user_id) REFERENCES users(id),
  CONSTRAINT fk_reports_resolver FOREIGN KEY (resolved_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  actor_role    VARCHAR(20) NOT NULL,
  action        VARCHAR(100) NOT NULL,              -- e.g. payment.approve, vendor.suspend
  entity_type   VARCHAR(40) NULL,
  entity_id     BIGINT UNSIGNED NULL,
  ip            CHAR(45) NULL,
  meta          JSON NULL,                          -- before/after summary; never secrets
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_audit_actor (actor_user_id, created_at),
  KEY ix_audit_entity (entity_type, entity_id),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NOT NULL,
  type       VARCHAR(60) NOT NULL,                  -- payment.approved, subscription.expiring, …
  title      VARCHAR(160) NOT NULL,
  body       TEXT NULL,
  data       JSON NULL,
  read_at    DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_notif_user (user_id, read_at, created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE platform_settings (
  skey       VARCHAR(80) NOT NULL,
  svalue     JSON NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (skey)
) ENGINE=InnoDB;

CREATE TABLE sessions (
  id            CHAR(40) NOT NULL,
  user_id       BIGINT UNSIGNED NOT NULL,
  payload       TEXT NOT NULL,
  last_activity INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY ix_sessions_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- SEEDS (run after schema)
-- ============================================================================

-- Item types
INSERT INTO item_types (name, slug, url_segment, cta_label, seo_schema_type, whatsapp_template_key, sort_order) VALUES
('Product',        'product',        'products', 'Enquire on WhatsApp', 'Product', 'purchase',     1),
('Service',        'service',        'services', 'Request a Quote',     'Service', 'service',      2),
('Course',         'course',         'courses',  'Enrol on WhatsApp',   'Course',  'enrol',        3),
('Event',          'event',          'events',   'Book on WhatsApp',    'Event',   'booking',      4),
('Property',       'property',       'properties','Request Inspection', 'Product', 'inspection',   5),
('Digital Product','digital-product','digital',  'Get on WhatsApp',     'Product', 'purchase',     6);

-- Default industry categories (admin can add/edit/delete; field_schema drives the dynamic form)
INSERT INTO categories (name, slug, description, icon, field_schema, sort_order) VALUES
('Fashion & Apparel', 'fashion',
 'Clothing, shoes, bags, accessories.', '👗',
 JSON_ARRAY(
   JSON_OBJECT('key','brand','label','Brand','type','text','required',0,'order',1),
   JSON_OBJECT('key','sizes','label','Sizes','type','multi_select','required',0,
               'options','["XS","S","M","L","XL","XXL"]','order',2),
   JSON_OBJECT('key','colours','label','Colours','type','multi_select','required',0,
               'options','["Black","White","Red","Blue","Green","Beige","Ankara"]','order',3),
   JSON_OBJECT('key','material','label','Material','type','text','required',0,'order',4),
   JSON_OBJECT('key','gender','label','Gender','type','select','required',0,
               'options','["Women","Men","Unisex","Kids"]','order',5)
 ), 1),
('Technology & Electronics', 'technology',
 'Phones, laptops, accessories, gadgets.', '💻',
 JSON_ARRAY(
   JSON_OBJECT('key','brand','label','Brand','type','text','required',0,'order',1),
   JSON_OBJECT('key','model','label','Model','type','text','required',0,'order',2),
   JSON_OBJECT('key','specifications','label','Specifications','type','long_text','required',0,'order',3),
   JSON_OBJECT('key','warranty','label','Warranty','type','text','required',0,'order',4),
   JSON_OBJECT('key','condition','label','Condition','type','select','required',0,
               'options','["Brand new","Refurbished","Used - good"]','order',5)
 ), 2),
('Tech Academy / Courses', 'academy',
 'Training, bootcamps, certifications.', '🎓',
 JSON_ARRAY(
   JSON_OBJECT('key','duration','label','Duration','type','text','required',1,'order',1,
               'placeholder','e.g. 12 weeks'),
   JSON_OBJECT('key','skill_level','label','Skill level','type','select','required',0,
               'options','["Beginner","Intermediate","Advanced"]','order',2),
   JSON_OBJECT('key','delivery_mode','label','Delivery mode','type','select','required',0,
               'options','["Online","In-person","Hybrid"]','order',3),
   JSON_OBJECT('key','certification','label','Certificate issued','type','boolean','required',0,'order',4),
   JSON_OBJECT('key','start_date','label','Next start date','type','date','required',0,'order',5),
   JSON_OBJECT('key','instructor','label','Instructor','type','text','required',0,'order',6),
   JSON_OBJECT('key','curriculum','label','Curriculum / syllabus','type','long_text','required',0,'order',7)
 ), 3),
('Services & Bookings', 'services',
 'Consulting, repairs, beauty, professional services.', '🛠️',
 JSON_ARRAY(
   JSON_OBJECT('key','duration','label','Typical duration','type','text','required',0,'order',1),
   JSON_OBJECT('key','delivery_method','label','How it is delivered','type','select','required',0,
               'options','["On-site","Remote","At my office","Client location"]','order',2),
   JSON_OBJECT('key','requirements','label','What the client must provide','type','long_text','required',0,'order',3)
 ), 4),
('Real Estate', 'real-estate',
 'Homes, land, commercial spaces, rentals.', '🏠',
 JSON_ARRAY(
   JSON_OBJECT('key','property_type','label','Property type','type','select','required',1,'order',1,
               'options','["House","Apartment","Land","Shop","Office","Warehouse"]'),
   JSON_OBJECT('key','bedrooms','label','Bedrooms','type','number','required',0,'order',2),
   JSON_OBJECT('key','bathrooms','label','Bathrooms','type','number','required',0,'order',3),
   JSON_OBJECT('key','location','label','Location','type','text','required',1,'order',4),
   JSON_OBJECT('key','purpose','label','Purpose','type','select','required',0,
               'options','["Sale","Rental","Lease"]','order',5),
   JSON_OBJECT('key','features','label','Features','type','long_text','required',0,'order',6)
 ), 5),
('Food & Restaurant', 'food',
 'Restaurants, catering, food vendors.', '🍽️',
 JSON_ARRAY(
   JSON_OBJECT('key','cuisine','label','Cuisine / specialty','type','text','required',0,'order',1),
   JSON_OBJECT('key','serves','label','Serves (min–max)','type','text','required',0,'order',2),
   JSON_OBJECT('key','delivery_area','label','Delivery area','type','text','required',0,'order',3)
 ), 6),
('General Retail', 'general-retail',
 'Anything else that is sold as an item.', '🛍️',
 JSON_ARRAY(
   JSON_OBJECT('key','brand','label','Brand','type','text','required',0,'order',1),
   JSON_OBJECT('key','specifications','label','Details / specs','type','long_text','required',0,'order',2),
   JSON_OBJECT('key','warranty','label','Warranty','type','text','required',0,'order',3)
 ), 7);

-- Default plans (prices editable by admin in settings)
INSERT INTO plans (name, slug, description, price, interval, trial_days, quota, features, is_default, sort_order) VALUES
('Free',     'free',     'Start your storefront, no card needed.', 0, 'once', 30,
 JSON_OBJECT('max_whatsapp_numbers',1,'max_storage_mb',500,'max_listings',10,'max_categories',1,'max_staff',0,'featured_listings',0),
 JSON_ARRAY('1 WhatsApp number','500MB media','10 catalogue items','Basic analytics'), 1, 1),
('Starter',  'starter',  'For small businesses ready to grow.', 15000, 'monthly', 14,
 JSON_OBJECT('max_whatsapp_numbers',2,'max_storage_mb',5120,'max_listings',100,'max_categories',3,'max_staff',0,'featured_listings',1),
 JSON_ARRAY('2 WhatsApp numbers','5GB media','100 catalogue items','1 featured listing','Custom branding'), 0, 2),
('Business', 'business', 'For established businesses with volume.', 35000, 'monthly', 14,
 JSON_OBJECT('max_whatsapp_numbers',5,'max_storage_mb',20480,'max_listings',-1,'max_categories',-1,'max_staff',3,'featured_listings',5),
 JSON_ARRAY('5 WhatsApp numbers','20GB media','Unlimited items','Up to 5 featured listings','3 staff accounts','Advanced analytics'), 0, 3),
('Enterprise','enterprise','Custom limits — talk to us.', 100000, 'monthly', 0,
 JSON_OBJECT('max_whatsapp_numbers',10,'max_storage_mb',-1,'max_listings',-1,'max_categories',-1,'max_staff',10,'featured_listings',-1),
 JSON_ARRAY('10 WhatsApp numbers','Custom storage','Unlimited everything','Priority support','Custom domain (P2)'), 0, 4);

-- Default add-ons
INSERT INTO addons (name, slug, description, type, unit, price, duration_days, sort_order) VALUES
('Extra WhatsApp number',   'extra-whatsapp-number', 'Add another WhatsApp number to your store.', 'extra_whatsapp_number', '1', 5000, 30, 1),
('Extra 10GB storage',      'extra-storage-10gb',    'Add 10GB of media storage.',                'extra_storage',       '10GB', 8000, 30, 2),
('Featured listing',        'featured-listing',      'Boost one item to the top of its category.', 'featured_listing',    '1', 3000, 30, 3),
('Extra category',          'extra-category',        'Sell in one more industry category.',        'extra_category',      '1', 4000, 30, 4),
('Extra staff account',     'extra-staff-account',   'Invite another team member.',                'staff_account',       '1', 10000, 30, 5);

-- Global default WhatsApp message templates
INSERT INTO message_templates (business_id, item_type_id, name, body) VALUES
(NULL, 1, 'Purchase enquiry',
 'Hello {{business_name}},\n\nI am interested in this item:\n\nProduct: {{item_name}}\nPrice: {{price}}\nQuantity: {{quantity}}\n\nProduct page:\n{{item_url}}\n\nPlease provide more information.'),
(NULL, 2, 'Service enquiry',
 'Hello {{business_name}},\n\nI would like to enquire about your service:\n\nService: {{item_name}}\nStarting price: {{price}}\n\nService page:\n{{item_url}}\n\nPlease tell me how to proceed.'),
(NULL, 3, 'Course enrolment',
 'Hello {{business_name}},\n\nI would like to enrol in this course:\n\nCourse: {{item_name}}\nPrice: {{price}}\n\nCourse page:\n{{item_url}}\n\nPlease send me the admission details.'),
(NULL, 4, 'Event booking',
 'Hello {{business_name}},\n\nI would like to book this event:\n\nEvent: {{item_name}}\nPrice: {{price}}\nQuantity: {{quantity}}\n\nEvent page:\n{{item_url}}'),
(NULL, 5, 'Inspection request',
 'Hello {{business_name}},\n\nI am interested in this property and would like to request an inspection:\n\nProperty: {{item_name}}\nPrice: {{price}}\n\nListing page:\n{{item_url}}'),
(NULL, NULL, 'General enquiry',
 'Hello {{business_name}},\n\nI found your store on CyberShop and I would like to make an enquiry.\n\nStore: {{business_url}}');

-- Platform settings
INSERT INTO platform_settings (skey, svalue) VALUES
('platform',      JSON_OBJECT('name','CyberShop','tagline','Find a business. Talk to it on WhatsApp.','currency','NGN','support_email','support@cybershop.ng')),
('bank_accounts', JSON_ARRAY()),   -- [{bank, account_number, account_name, reference_hint}]
('paystack',      JSON_OBJECT('enabled',0,'public_key','')),
('seo',           JSON_OBJECT('og_image','/img/og-default.png','twitter_handle','@cybershopng')),
('upload_limits', JSON_OBJECT('max_image_mb',8,'max_video_mb',200,'allowed_image_types','["image/jpeg","image/png","image/webp"]','allowed_document_types','["application/pdf"]'));
