#!/usr/bin/env bash
#
# CyberShop — demo data seed (idempotent).
#
# Requires the worker to be running on 127.0.0.1:8787 (bootstrap-dev.sh +
# `cd worker && npm run dev`). If the demo vendor already exists it exits
# cleanly; otherwise it creates:
#
#   • vendor  ada@test.ng / Passw0rd123 — "Ada Tech Academy" (free plan, active)
#   • 2 published courses (Web Development ₦100k, UI/UX Design Sprint ₦65k)
#   • store cover + course photos (scripts/seed-demo/*.jpg)
#   • a 21s demo voice note on the first course
#   • billing demo state: 1 submitted payment (proof attached) + 1 pending
#
# Usage:  ./scripts/seed-demo.sh
set -euo pipefail
cd "$(dirname "$0")/.."

B=http://127.0.0.1:8787/api
A=scripts/seed-demo
SECRET=$(grep '^INTERNAL_SECRET=' worker/.dev.vars | cut -d= -f2)
J='content-type: application/json'

# worker up?
if ! curl -s -o /dev/null --max-time 3 http://127.0.0.1:8787/healthz; then
  echo "error: worker is not running on 127.0.0.1:8787 — start it first (cd worker && npm run dev)"
  exit 1
fi

# already seeded?
if [ -f /tmp/cs-seed-ada.txt ] \
  && curl -s -b /tmp/cs-seed-ada.txt -H "x-internal-secret: $SECRET" -H "$J" \
       -X POST $B/auth/login -d '{"email":"ada@test.ng","password":"Passw0rd123"}' \
       | grep -q '"ok":true'; then
  echo "✓ demo data already present (ada@test.ng) — nothing to do."
  exit 0
fi
rm -f /tmp/cs-seed-ada.txt

echo "→ registering demo vendor (Ada Tech Academy)…"
curl -s -c /tmp/cs-seed-ada.txt -H "x-internal-secret: $SECRET" -H "$J" -X POST $B/auth/register -d '{
  "role":"vendor","name":"Ada Obi","email":"ada@test.ng","password":"Passw0rd123","phone":"08031230001",
  "business_name":"Ada Tech Academy","slug":"ada-tech-academy","category_slug":"academy",
  "whatsapp_number":"08031230001","city":"Lagos","state_region":"Lagos"
}' | grep -q '"ok":true' || { echo "error: registration failed"; exit 1; }

echo "→ activating free plan…"
curl -s -b /tmp/cs-seed-ada.txt -H "x-internal-secret: $SECRET" -H "$J" \
  -X POST $B/vendor/payment-intent -d '{"plan_slug":"free","method":"bank_transfer"}' >/dev/null

json() { python3 -c "import json,sys; d=json.load(sys.stdin); print(d$1)"; }

echo "→ uploading demo media…"
A1=$(curl -s -b /tmp/cs-seed-ada.txt -H "x-internal-secret: $SECRET" -X POST $B/vendor/media/upload -F "file=@$A/course1.jpg;type=image/jpeg" | json "['media']['id']")
A2=$(curl -s -b /tmp/cs-seed-ada.txt -H "x-internal-secret: $SECRET" -X POST $B/vendor/media/upload -F "file=@$A/course2.jpg;type=image/jpeg" | json "['media']['id']")
AC=$(curl -s -b /tmp/cs-seed-ada.txt -H "x-internal-secret: $SECRET" -X POST $B/vendor/media/upload -F "file=@$A/cover.jpg;type=image/jpeg" | json "['media']['id']")

echo "→ creating 2 courses…"
C1=$(curl -s -b /tmp/cs-seed-ada.txt -H "x-internal-secret: $SECRET" -H "$J" -X POST $B/vendor/items -d '{
  "name":"Web Development Course","item_type_slug":"course","category_slug":"academy",
  "description":"A hands-on 12-week web development bootcamp covering HTML, CSS, JavaScript, React and deployment.\n\nWhat you get:\n- Live online classes, 3x per week\n- Lifetime access to course materials\n- Certificate on completion\n- Career coaching session\n\nBuilt for absolute beginners and career-switchers in Lagos and beyond.",
  "price_kobo":10000000,"price_type":"fixed","stock_status":"in_stock","featured":true,
  "custom_fields":{"duration":"12 weeks","skill_level":"Beginner","delivery_mode":"Online","certification":true,"start_date":"2026-10-05","instructor":"Ada Obi"},
  "media_ids":['"$A1"','$A2'],
  "publish":true
}' | json "['id']")
C2=$(curl -s -b /tmp/cs-seed-ada.txt -H "x-internal-secret: $SECRET" -H "$J" -X POST $B/vendor/items -d '{
  "name":"UI/UX Design Sprint","item_type_slug":"course","category_slug":"academy",
  "description":"A 2-week intensive on product design: research, wireframing, visual design and handing off to developers. Live reviews every session.\n\nCohorts start monthly — small groups of 12 so you get real feedback.",
  "price_kobo":6500000,"price_type":"fixed","stock_status":"in_stock","featured":false,
  "custom_fields":{"duration":"2 weeks","skill_level":"Beginner","delivery_mode":"Online","certification":false,"start_date":"2026-10-19","instructor":"Ada Obi"},
  "media_ids":['"$A2"'],
  "publish":true
}' | json "['id']")

echo "→ setting store cover + demo voice note…"
curl -s -b /tmp/cs-seed-ada.txt -H "x-internal-secret: $SECRET" -H "$J" \
  -X POST $B/vendor/business/media -d "{\"field\":\"cover\",\"media_id\":$AC}" >/dev/null
AA=$(curl -s -b /tmp/cs-seed-ada.txt -H "x-internal-secret: $SECRET" -X POST $B/vendor/media/upload-audio -F "file=@$A/demo-voice.wav;type=audio/wav" | json "['media']['id']")
curl -s -b /tmp/cs-seed-ada.txt -H "x-internal-secret: $SECRET" -H "$J" -X PUT $B/vendor/items/$C1 -d '{
  "name":"Web Development Course","item_type_slug":"course","category_slug":"academy",
  "description":"A hands-on 12-week web development bootcamp covering HTML, CSS, JavaScript, React and deployment.\n\nWhat you get:\n- Live online classes, 3x per week\n- Lifetime access to course materials\n- Certificate on completion\n- Career coaching session\n\nBuilt for absolute beginners and career-switchers in Lagos and beyond.",
  "price_kobo":10000000,"price_type":"fixed","stock_status":"in_stock","featured":true,
  "custom_fields":{"duration":"12 weeks","skill_level":"Beginner","delivery_mode":"Online","certification":true,"start_date":"2026-10-05","instructor":"Ada Obi"},
  "media_ids":['"$A1"','$A2'],
  "audio_media_id":'$AA',
  "publish":true
}' >/dev/null

echo "→ billing demo state (1 submitted + 1 pending)…"
P1=$(curl -s -b /tmp/cs-seed-ada.txt -H "x-internal-secret: $SECRET" -H "$J" \
  -X POST $B/vendor/payment-intent -d '{"plan_slug":"starter","method":"bank_transfer"}' | json "['payment']['id']")
curl -s -b /tmp/cs-seed-ada.txt -H "x-internal-secret: $SECRET" \
  -X POST $B/vendor/payment-proof/$P1 -F "proof=@$A/course1.jpg;type=image/jpeg" >/dev/null
curl -s -b /tmp/cs-seed-ada.txt -H "x-internal-secret: $SECRET" -H "$J" \
  -X POST $B/vendor/payment-intent -d '{"plan_slug":"starter","method":"bank_transfer"}' >/dev/null

cat <<EOF

✓ Demo data seeded.
  Store:   http://localhost:3000/business/ada-tech-academy
  Vendor:  ada@test.ng / Passw0rd123   (dashboard → Catalogue / Billing / Leads)
  Admin:   admin@test.ng / AdminPass123
EOF
