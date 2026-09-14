-- Premium classifieds (vendors pay). WhatsApp enquiry stays free.
-- SQLite cannot ALTER a CHECK, so addons is rebuilt with extra types.
-- vendor_addons and payments reference addons — detach before the drop.

CREATE TABLE addons_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  type TEXT NOT NULL
    CHECK (type IN (
      'extra_whatsapp_number','extra_storage','featured_listing','extra_category',
      'staff_account','custom_domain','advanced_analytics',
      'in_app_chat','buyer_escrow','jobs_board','verified_id','reply_badge','inspection_reports'
    )),
  unit TEXT NOT NULL DEFAULT '1',
  price INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  duration_days INTEGER NOT NULL DEFAULT 30,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO addons_new (
  id, name, slug, description, type, unit, price, currency, duration_days, is_active, sort_order, created_at, updated_at
)
SELECT id, name, slug, description, type, unit, price, currency, duration_days, is_active, sort_order, created_at, updated_at
FROM addons;

CREATE TABLE _va_bak AS SELECT * FROM vendor_addons;
CREATE TABLE _pay_addon AS SELECT id, addon_id FROM payments;
UPDATE payments SET addon_id = NULL;
DROP TABLE vendor_addons;
DROP TABLE addons;
ALTER TABLE addons_new RENAME TO addons;

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
INSERT INTO vendor_addons (
  id, business_id, addon_id, quantity, status, payment_id, purchased_at, expires_at, created_at, updated_at
)
SELECT id, business_id, addon_id, quantity, status, payment_id, purchased_at, expires_at, created_at, updated_at
FROM _va_bak;
UPDATE payments SET addon_id = (SELECT addon_id FROM _pay_addon WHERE _pay_addon.id = payments.id);
DROP TABLE _va_bak;
DROP TABLE _pay_addon;

INSERT INTO addons (name, slug, description, type, unit, price, duration_days, sort_order) VALUES
('In-app inbox', 'in-app-chat', 'Buyers can message you on CyberShop as well as WhatsApp.', 'in_app_chat', '1', 800000, 30, 10),
('Deposits via Paystack', 'buyer-escrow', 'Accept a recorded deposit on an ad. You confirm handover — CyberShop never holds the cash as a bank.', 'buyer_escrow', '1', 1200000, 30, 11),
('Jobs & CVs', 'jobs-board', 'Post jobs and receive CVs in your catalogue.', 'jobs_board', '1', 600000, 30, 12),
('Verified ID', 'verified-id', 'Submit ID for review. Verified badge on every ad for 12 months.', 'verified_id', '1', 1500000, 365, 13),
('Reply-time badge', 'reply-badge', 'Show “typically replies within …” from real lead response times.', 'reply_badge', '1', 400000, 30, 14),
('Inspection reports', 'inspection-reports', 'Attach a written inspection / condition report to an ad (cars, phones, property).', 'inspection_reports', '1', 700000, 30, 15);

INSERT INTO item_types (name, slug, url_segment, cta_label, seo_schema_type, whatsapp_template_key, sort_order) VALUES
('Job', 'job', 'jobs', 'Apply on WhatsApp', 'JobPosting', 'job', 7),
('CV / Seeking work', 'cv', 'cvs', 'Contact on WhatsApp', 'Person', 'cv', 8);

INSERT INTO categories (name, slug, description, icon, field_schema, sort_order) VALUES
('Jobs', 'jobs', 'Hiring and seeking work.', '💼',
 '[{"key":"role_type","label":"Type","type":"select","required":true,"options":["Full-time","Part-time","Contract","Internship","Seeking work"],"order":1},{"key":"location","label":"Location","type":"text","required":false,"order":2},{"key":"experience","label":"Experience","type":"text","required":false,"order":3}]', 8);

INSERT INTO message_templates (business_id, item_type_id, name, body)
SELECT NULL, id, 'Job application',
'Hello {{business_name}},

I would like to apply for:

{{item_name}}
{{price}}

Listing:
{{item_url}}

Please tell me the next step.'
FROM item_types WHERE slug = 'job';

INSERT INTO message_templates (business_id, item_type_id, name, body)
SELECT NULL, id, 'CV enquiry',
'Hello {{business_name}},

I saw your CV on CyberShop:

{{item_name}}

Page:
{{item_url}}

I would like to discuss an opportunity.'
FROM item_types WHERE slug = 'cv';

ALTER TABLE listings ADD COLUMN inspection_json TEXT;
ALTER TABLE listings ADD COLUMN boosted_until TEXT;
ALTER TABLE inquiries ADD COLUMN first_response_at TEXT;

CREATE TABLE threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  listing_id INTEGER REFERENCES listings(id),
  buyer_user_id INTEGER REFERENCES users(id),
  buyer_name TEXT,
  buyer_phone TEXT,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_threads_biz ON threads(business_id, updated_at);
CREATE INDEX ix_threads_token ON threads(token);

CREATE TABLE thread_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  author TEXT NOT NULL CHECK (author IN ('buyer','vendor')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_tm_thread ON thread_messages(thread_id, id);

CREATE TABLE deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  listing_id INTEGER REFERENCES listings(id),
  buyer_user_id INTEGER REFERENCES users(id),
  buyer_name TEXT,
  buyer_phone TEXT,
  buyer_email TEXT,
  amount INTEGER NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  paystack_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','released','refunded','failed')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT,
  released_at TEXT
);
CREATE INDEX ix_dep_biz ON deposits(business_id, status);
CREATE INDEX ix_dep_ref ON deposits(reference);

CREATE TABLE verification_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  media_id INTEGER REFERENCES media(id),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  reviewed_by INTEGER REFERENCES users(id)
);
CREATE INDEX ix_vr_status ON verification_requests(status, created_at);

CREATE TABLE saved_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token TEXT,
  q TEXT,
  city TEXT,
  category TEXT,
  min_price INTEGER,
  max_price INTEGER,
  last_seen_listing_id INTEGER NOT NULL DEFAULT 0,
  last_notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_ss_user ON saved_searches(buyer_user_id);
