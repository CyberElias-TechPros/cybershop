-- CyberShop D1 migration 0002 — default configuration seeds (admin-editable, not fake data)

INSERT INTO item_types (name, slug, url_segment, cta_label, seo_schema_type, whatsapp_template_key, sort_order) VALUES
('Product',        'product',         'products',   'Enquire on WhatsApp',  'Product', 'purchase',   1),
('Service',        'service',         'services',   'Request a Quote',      'Service', 'service',    2),
('Course',         'course',          'courses',    'Enrol on WhatsApp',    'Course',  'enrol',      3),
('Event',          'event',           'events',     'Book on WhatsApp',     'Event',   'booking',    4),
('Property',       'property',        'properties', 'Request Inspection',   'Product', 'inspection', 5),
('Digital Product','digital-product', 'digital',    'Get on WhatsApp',      'Product', 'purchase',   6);

INSERT INTO categories (name, slug, description, icon, field_schema, sort_order) VALUES
('Fashion & Apparel', 'fashion', 'Clothing, shoes, bags, accessories.', '👗',
 '[]', 1),
('Technology & Electronics', 'technology', 'Phones, laptops, accessories, gadgets.', '💻',
 '[{"key":"brand","label":"Brand","type":"text","required":false,"order":1},{"key":"model","label":"Model","type":"text","required":false,"order":2},{"key":"specifications","label":"Specifications","type":"long_text","required":false,"order":3},{"key":"warranty","label":"Warranty","type":"text","required":false,"order":4},{"key":"condition","label":"Condition","type":"select","required":false,"options":["Brand new","Refurbished","Used - good"],"order":5}]', 2),
('Tech Academy / Courses', 'academy', 'Training, bootcamps, certifications.', '🎓',
 '[{"key":"duration","label":"Duration","type":"text","required":true,"placeholder":"e.g. 12 weeks","order":1},{"key":"skill_level","label":"Skill level","type":"select","required":false,"options":["Beginner","Intermediate","Advanced"],"order":2},{"key":"delivery_mode","label":"Delivery mode","type":"select","required":false,"options":["Online","In-person","Hybrid"],"order":3},{"key":"certification","label":"Certificate issued","type":"boolean","required":false,"order":4},{"key":"start_date","label":"Next start date","type":"date","required":false,"order":5},{"key":"instructor","label":"Instructor","type":"text","required":false,"order":6},{"key":"curriculum","label":"Curriculum / syllabus","type":"long_text","required":false,"order":7}]', 3),
('Services & Bookings', 'services', 'Consulting, repairs, beauty, professional services.', '🛠️',
 '[{"key":"duration","label":"Typical duration","type":"text","required":false,"order":1},{"key":"delivery_method","label":"How it is delivered","type":"select","required":false,"options":["On-site","Remote","At my office","Client location"],"order":2},{"key":"requirements","label":"What the client must provide","type":"long_text","required":false,"order":3}]', 4),
('Real Estate', 'real-estate', 'Homes, land, commercial spaces, rentals.', '🏠',
 '[{"key":"property_type","label":"Property type","type":"select","required":true,"options":["House","Apartment","Land","Shop","Office","Warehouse"],"order":1},{"key":"bedrooms","label":"Bedrooms","type":"number","required":false,"order":2},{"key":"bathrooms","label":"Bathrooms","type":"number","required":false,"order":3},{"key":"location","label":"Location","type":"text","required":true,"order":4},{"key":"purpose","label":"Purpose","type":"select","required":false,"options":["Sale","Rental","Lease"],"order":5},{"key":"features","label":"Features","type":"long_text","required":false,"order":6}]', 5),
('Food & Restaurant', 'food', 'Restaurants, catering, food vendors.', '🍽️',
 '[{"key":"cuisine","label":"Cuisine / specialty","type":"text","required":false,"order":1},{"key":"serves","label":"Serves (min-max)","type":"text","required":false,"order":2},{"key":"delivery_area","label":"Delivery area","type":"text","required":false,"order":3}]', 6),
('General Retail', 'general-retail', 'Anything else that is sold as an item.', '🛍️',
 '[{"key":"brand","label":"Brand","type":"text","required":false,"order":1},{"key":"specifications","label":"Details / specs","type":"long_text","required":false,"order":2},{"key":"warranty","label":"Warranty","type":"text","required":false,"order":3}]', 7);

-- update fashion schema (kept last due to ordering); simpler: set via UPDATE
UPDATE categories SET field_schema =
 '[{"key":"brand","label":"Brand","type":"text","required":false,"order":1},{"key":"sizes","label":"Sizes","type":"multi_select","required":false,"options":["XS","S","M","L","XL","XXL"],"order":2},{"key":"colours","label":"Colours","type":"multi_select","required":false,"options":["Black","White","Red","Blue","Green","Beige","Ankara"],"order":3},{"key":"material","label":"Material","type":"text","required":false,"order":4},{"key":"gender","label":"Gender","type":"select","required":false,"options":["Women","Men","Unisex","Kids"],"order":5}]'
WHERE slug = 'fashion';

INSERT INTO plans (name, slug, description, price, interval, trial_days, quota, features, is_default, sort_order) VALUES
('Free', 'free', 'Start your storefront, no card needed.', 0, 'once', 30,
 '{"max_whatsapp_numbers":1,"max_storage_mb":500,"max_listings":10,"max_categories":1,"max_staff":0,"featured_listings":0}',
 '["1 WhatsApp number","500MB media","10 catalogue items","Basic analytics"]', 1, 1),
('Starter', 'starter', 'For small businesses ready to grow.', 1500000, 'monthly', 14,
 '{"max_whatsapp_numbers":2,"max_storage_mb":5120,"max_listings":100,"max_categories":3,"max_staff":0,"featured_listings":1}',
 '["2 WhatsApp numbers","5GB media","100 catalogue items","1 featured listing","Custom branding"]', 0, 2),
('Business', 'business', 'For established businesses with volume.', 3500000, 'monthly', 14,
 '{"max_whatsapp_numbers":5,"max_storage_mb":20480,"max_listings":-1,"max_categories":-1,"max_staff":3,"featured_listings":5}',
 '["5 WhatsApp numbers","20GB media","Unlimited items","Up to 5 featured listings","3 staff accounts","Advanced analytics"]', 0, 3),
('Enterprise', 'enterprise', 'Custom limits - talk to us.', 10000000, 'monthly', 0,
 '{"max_whatsapp_numbers":10,"max_storage_mb":-1,"max_listings":-1,"max_categories":-1,"max_staff":10,"featured_listings":-1}',
 '["10 WhatsApp numbers","Custom storage","Unlimited everything","Priority support"]', 0, 4);

INSERT INTO addons (name, slug, description, type, unit, price, duration_days, sort_order) VALUES
('Extra WhatsApp number', 'extra-whatsapp-number', 'Add another WhatsApp number to your store.', 'extra_whatsapp_number', '1', 500000, 30, 1),
('Extra 10GB storage', 'extra-storage-10gb', 'Add 10GB of media storage.', 'extra_storage', '10GB', 800000, 30, 2),
('Featured listing', 'featured-listing', 'Boost one item to the top of its category.', 'featured_listing', '1', 300000, 30, 3),
('Extra category', 'extra-category', 'Sell in one more industry category.', 'extra_category', '1', 400000, 30, 4),
('Extra staff account', 'extra-staff-account', 'Invite another team member.', 'staff_account', '1', 1000000, 30, 5);

INSERT INTO message_templates (business_id, item_type_id, name, body) VALUES
(NULL, 1, 'Purchase enquiry',
'Hello {{business_name}},

I am interested in this item:

Product: {{item_name}}
Price: {{price}}
Quantity: {{quantity}}

Product page:
{{item_url}}

Please provide more information.'),
(NULL, 2, 'Service enquiry',
'Hello {{business_name}},

I would like to enquire about your service:

Service: {{item_name}}
Starting price: {{price}}

Service page:
{{item_url}}

Please tell me how to proceed.'),
(NULL, 3, 'Course enrolment',
'Hello {{business_name}},

I would like to enrol in this course:

Course: {{item_name}}
Price: {{price}}

Course page:
{{item_url}}

Please send me the admission details.'),
(NULL, 4, 'Event booking',
'Hello {{business_name}},

I would like to book this event:

Event: {{item_name}}
Price: {{price}}
Quantity: {{quantity}}

Event page:
{{item_url}}'),
(NULL, 5, 'Inspection request',
'Hello {{business_name}},

I am interested in this property and would like to request an inspection:

Property: {{item_name}}
Price: {{price}}

Listing page:
{{item_url}}'),
(NULL, NULL, 'General enquiry',
'Hello {{business_name}},

I found your store on CyberShop and I would like to make an enquiry.

Store: {{business_url}}');

INSERT INTO platform_settings (skey, svalue) VALUES
('platform',      '{"name":"CyberShop","tagline":"Find a business. Talk to it on WhatsApp.","currency":"NGN","support_email":"support@cybershop.ng"}'),
('bank_accounts', '[]'),
('paystack',      '{"enabled":true}'),
('seo',           '{"og_image":"/og.png","twitter_handle":"@cybershopng"}'),
('upload_limits', '{"max_image_mb":8,"max_video_mb":200,"allowed_image_types":["image/jpeg","image/png","image/webp"]}');

-- Note: the first admin account is created at boot by ensureAdmin() (src/boot.ts)
-- from the SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD env vars — never from a static hash in git.
