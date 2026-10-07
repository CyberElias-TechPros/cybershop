-- 0009 — Academy course fields, course-specific WhatsApp ask, platform safety notice
--
-- 1. "Tech Academy / Courses" gains the structured fields a course catalogue
--    actually needs: how many sessions, and what the learner walks out with.
--    (Sessions and outcome used to be crammed into the description, so they
--    could not be filtered or shown as a spec table.)
-- 2. The course WhatsApp template asks the two questions every prospective
--    student asks first — next start date and how to enrol — and names the
--    course, so the merchant knows which listing produced the chat.
-- 3. A platform-wide safety notice (verify before you pay) is seeded as an
--    admin-editable setting so it can be tuned without a deploy.

-- ---------------------------------------------------------------- catalogue
UPDATE categories
SET field_schema = '[
  {"key":"duration","label":"Duration","type":"text","required":true,"placeholder":"e.g. 3 weeks","order":1},
  {"key":"sessions","label":"Sessions","type":"text","required":false,"placeholder":"e.g. 6 sessions \u00b7 2 per week","order":2},
  {"key":"skill_level","label":"Level","type":"select","required":false,"options":["Absolute beginner","Beginner","Intermediate","Advanced"],"order":3},
  {"key":"delivery_mode","label":"Delivery mode","type":"select","required":false,"options":["Online","In-person","Hybrid"],"order":4},
  {"key":"certification","label":"Certificate issued","type":"boolean","required":false,"order":5},
  {"key":"start_date","label":"Next start date","type":"date","required":false,"order":6},
  {"key":"instructor","label":"Instructor","type":"text","required":false,"order":7},
  {"key":"outcome","label":"What you will produce","type":"long_text","required":false,"order":8},
  {"key":"curriculum","label":"Curriculum / syllabus","type":"long_text","required":false,"order":9}
]'
WHERE slug = 'academy';

-- ---------------------------------------------------------------- whatsapp
UPDATE message_templates
SET body = 'Hello {{business_name}},

I am interested in the {{item_name}} {{item_type_lc}} listed on CyberShop.

Course: {{item_name}}
Fee: {{price}}
Duration: {{duration}}

Listing: {{item_url}}

Please tell me the next available start date and how to enrol.'
WHERE business_id IS NULL AND item_type_id = 3;

-- ---------------------------------------------------------------- safety
INSERT OR IGNORE INTO platform_settings (skey, svalue) VALUES
('safety', '{
  "enabled": true,
  "headline": "CyberShop never collects payment",
  "notice": "We are a catalogue and an introduction, not a shop. Agree the details on WhatsApp, then verify the goods or service and only pay the seller when you are satisfied.",
  "tips": [
    "Inspect or verify before you pay \u2014 a live video, a receipt, or a public meetup.",
    "Never pay a \u201cCyberShop fee\u201d, a \u201cdelivery deposit\u201d or any account we did not give you.",
    "Keep the conversation on WhatsApp \u2014 it is your receipt if anything goes wrong.",
    "If a deal feels rushed or too cheap, walk away and report the listing."
  ]
}');
