#!/usr/bin/env bash
#
# CyberShop — demo data seed (idempotent).
#
# Requires the worker to be running on 127.0.0.1:8787 (bootstrap-dev.sh +
# `cd worker && npm run dev`). If the demo vendor already exists it exits
# cleanly; otherwise it creates:
#
#   • vendor  cea@test.ng / Passw0rd123 — "Cyber Elias Academy" (free plan, active)
#   • 10 published courses from the CEA flyer (free plan listing cap)
#   • store cover + course photos (scripts/seed-demo/*.jpg)
#   • a demo voice note on Web Development
#   • billing demo state: 1 submitted payment (proof attached) + 1 pending
#
# Usage:  ./scripts/seed-demo.sh
set -euo pipefail
cd "$(dirname "$0")/.."

B=http://127.0.0.1:8787/api
A=scripts/seed-demo
SECRET=$(grep '^INTERNAL_SECRET=' worker/.dev.vars | cut -d= -f2)
J='content-type: application/json'
COOKIE=/tmp/cs-seed-cea.txt

# worker up?
if ! curl -s -o /dev/null --max-time 3 http://127.0.0.1:8787/healthz; then
  echo "error: worker is not running on 127.0.0.1:8787 — start it first (cd worker && npm run dev)"
  exit 1
fi

# already seeded?
if [ -f "$COOKIE" ] \
  && curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -H "$J" \
       -X POST $B/auth/login -d '{"email":"cea@test.ng","password":"Passw0rd123"}' \
       | grep -q '"ok":true'; then
  echo "✓ demo data already present (cea@test.ng) — nothing to do."
  exit 0
fi
rm -f "$COOKIE"

echo "→ registering demo vendor (Cyber Elias Academy)…"
curl -s -c "$COOKIE" -H "x-internal-secret: $SECRET" -H "$J" -X POST $B/auth/register -d '{
  "role":"vendor","name":"Cyber Elias","email":"cea@test.ng","password":"Passw0rd123","phone":"09058628386",
  "business_name":"Cyber Elias Academy","slug":"cyber-elias-academy","category_slug":"academy",
  "whatsapp_number":"09058628386","city":"Port Harcourt","state_region":"Rivers"
}' | grep -q '"ok":true' || { echo "error: registration failed"; exit 1; }

echo "→ activating free plan…"
curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -H "$J" \
  -X POST $B/vendor/payment-intent -d '{"plan_slug":"free","method":"bank_transfer"}' >/dev/null

echo "→ store profile (flyer)…"
curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -H "$J" -X PUT $B/vendor/business -d '{
  "name":"Cyber Elias Academy",
  "slug":"cyber-elias-academy",
  "about":"From Zero to Expert, Together.\n\nLearn practical digital skills for a brighter future — beginner friendly, affordable and flexible, with a certificate on completion and expert instructors.\n\nNew skills. Real opportunities.\n\nCourses on the board (₦):\n• Microsoft Office — 15,000 / 3 weeks\n• Typing & Computer Basics — 10,000 / 2 weeks\n• Graphic Design — 20,000 / 4 weeks\n• WordPress — 25,000 / 6 weeks\n• Digital Marketing — 20,000 / 4 weeks\n• Social Media Management — 15,000 / 3 weeks\n• Data Entry — 10,000 / 2 weeks\n• Computer Repairs — 25,000 / 4 weeks\n• Web Development — 30,000 / 6 weeks\n• Cybersecurity — 25,000 / 4 weeks\n• Networking — 15,000 / 3 weeks\n• Python Programming — 30,000 / 3 weeks\n• CBT Practice — 15,000 / 3 weeks\n\nWalk in at 24 Ebony Road (Opp. E-Plaza), off Rumuola Road, Port Harcourt — or message us on WhatsApp.",
  "phone":"09058628386",
  "email":"hello@cea.ng",
  "address":"24 Ebony Road (Opp. E-Plaza), off Rumuola Road",
  "city":"Port Harcourt",
  "state_region":"Rivers",
  "website":"https://cea.ng"
}' >/dev/null

json() { python3 -c "import json,sys; d=json.load(sys.stdin); print(d$1)"; }

echo "→ uploading demo media…"
A1=$(curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -X POST $B/vendor/media/upload -F "file=@$A/course1.jpg;type=image/jpeg" | json "['media']['id']")
A2=$(curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -X POST $B/vendor/media/upload -F "file=@$A/course2.jpg;type=image/jpeg" | json "['media']['id']")
AC=$(curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -X POST $B/vendor/media/upload -F "file=@$A/cover.jpg;type=image/jpeg" | json "['media']['id']")

echo "→ creating Cyber Elias Academy courses…"
WEB_ID=$(SECRET="$SECRET" COOKIE="$COOKIE" B="$B" A1="$A1" A2="$A2" python3 - <<'PY'
import json, os, urllib.request

secret, cookie, base = os.environ["SECRET"], open(os.environ["COOKIE"]).read(), os.environ["B"]
# Netscape cookie file → cs_session value
sid = ""
for line in cookie.splitlines():
    if "cs_session" in line and not line.startswith("#"):
        sid = line.split("\t")[-1].strip()
a1, a2 = int(os.environ["A1"]), int(os.environ["A2"])

courses = [
  ("Microsoft Office", "Word, Excel, PowerPoint and more — the office suite every workplace still asks for. Beginner friendly. Certificate on completion.",
   1500000, "3 weeks", "Word, Excel, PowerPoint, file management and professional documents."),
  ("Typing & Computer Basics", "Type faster and work smarter. Keyboarding, Windows, files, email and the confidence to sit at any PC.",
   1000000, "2 weeks", "Touch typing, folders, browsers, email and everyday computer use."),
  ("Graphic Design", "Create stunning designs for print and social. Tools, layout, colour and a portfolio piece you can show a client.",
   2000000, "4 weeks", "Layout, typography, brand basics and social creatives."),
  ("WordPress", "Build WordPress sites — pages, themes, plugins and handing a live site to a client.",
   2500000, "6 weeks", "Install, pages, posts, themes, plugins, forms and going live."),
  ("Digital Marketing", "Grow brands online. Ads, funnels, content and measuring what actually converts.",
   2000000, "4 weeks", "Content, ads, landing pages and campaign tracking."),
  ("Social Media Management", "Plan · Earn · Grow. Calendars, captions, community and reporting for real Nigerian brands.",
   1500000, "3 weeks", "Content calendars, community management and basic paid boosts."),
  ("Computer Repairs", "Fix, maintain, keep it running. Hardware diagnosis, software repair and preventive care.",
   2500000, "4 weeks", "Diagnosis, upgrades, OS reinstalls and common hardware faults."),
  ("Web Development", "HTML, CSS, JavaScript and more. A practical 6-week path from first tag to a site you can show.",
   3000000, "6 weeks", "HTML, CSS, JavaScript, responsive layouts and publishing."),
  ("Cybersecurity", "Stay safe online. Threats, passwords, devices and the habits that keep a small business off the breach list.",
   2500000, "4 weeks", "Threats, hardening, backups and safe browsing for staff."),
  ("Python Programming", "Learn Python from scratch — syntax, scripts and small programs you can actually run.",
   3000000, "3 weeks", "Syntax, data, functions and small automation scripts."),
]

def post(path, payload):
    req = urllib.request.Request(base + path, method="POST", data=json.dumps(payload).encode())
    req.add_header("content-type", "application/json")
    req.add_header("x-internal-secret", secret)
    req.add_header("cookie", f"cs_session={sid}")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())

web_id = None
for i, (name, desc, kobo, duration, curriculum) in enumerate(courses):
    mid = a1 if i % 2 == 0 else a2
    body = {
        "name": name,
        "item_type_slug": "course",
        "category_slug": "academy",
        "description": desc + "\n\nIn person at 24 Ebony Road (Opp. E-Plaza), off Rumuola Road, Port Harcourt. Affordable and flexible. WhatsApp 09058628386 to enrol.",
        "price_kobo": kobo,
        "price_type": "fixed",
        "stock_status": "in_stock",
        "featured": False,
        "custom_fields": {
            "duration": duration,
            "skill_level": "Beginner",
            "delivery_mode": "In-person",
            "certification": True,
            "instructor": "Cyber Elias Academy",
            "curriculum": curriculum,
        },
        "media_ids": [mid],
        "publish": True,
    }
    out = post("/vendor/items", body)
    if name == "Web Development":
        web_id = out.get("id")
print(web_id or "")
PY
)

echo "→ setting store cover + demo voice note…"
curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -H "$J" \
  -X POST $B/vendor/business/media -d "{\"field\":\"cover\",\"media_id\":$AC}" >/dev/null
if [ -n "${WEB_ID:-}" ]; then
  AA=$(curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -X POST $B/vendor/media/upload-audio -F "file=@$A/demo-voice.wav;type=audio/wav" | json "['media']['id']")
  curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -H "$J" \
    -X POST $B/vendor/items/$WEB_ID/status -d '{"status":"published"}' >/dev/null || true
  # attach audio without rewriting the whole item (PUT re-validates category fields)
  python3 - <<PY
import json, os, urllib.request
secret = """$SECRET"""
sid = ""
for line in open("$COOKIE"):
    if "cs_session" in line and not line.startswith("#"):
        sid = line.split("\t")[-1].strip()
req = urllib.request.Request("$B/vendor/items/$WEB_ID", method="GET")
req.add_header("x-internal-secret", secret)
req.add_header("cookie", f"cs_session={sid}")
with urllib.request.urlopen(req) as r:
    item = json.loads(r.read().decode())["item"]
body = {
    "name": item["name"],
    "item_type_slug": item.get("item_type_slug") or "course",
    "category_slug": item.get("category_slug") or "academy",
    "description": item.get("description"),
    "price_kobo": item.get("price"),
    "price_type": item.get("price_type") or "fixed",
    "stock_status": item.get("stock_status") or "in_stock",
    "featured": False,
    "custom_fields": item.get("custom_fields") or {},
    "media_ids": [m["id"] for m in (item.get("images") or [])],
    "audio_media_id": int("$AA"),
    "publish": True,
}
req = urllib.request.Request("$B/vendor/items/$WEB_ID", method="PUT", data=json.dumps(body).encode())
req.add_header("content-type", "application/json")
req.add_header("x-internal-secret", secret)
req.add_header("cookie", f"cs_session={sid}")
urllib.request.urlopen(req).read()
PY
fi

echo "→ billing demo state (1 submitted + 1 pending)…"
P1=$(curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -H "$J" \
  -X POST $B/vendor/payment-intent -d '{"plan_slug":"starter","method":"bank_transfer"}' | json "['payment']['id']")
curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" \
  -X POST $B/vendor/payment-proof/$P1 -F "proof=@$A/course1.jpg;type=image/jpeg" >/dev/null
curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -H "$J" \
  -X POST $B/vendor/payment-intent -d '{"plan_slug":"starter","method":"bank_transfer"}' >/dev/null

cat <<EOF

✓ Demo data seeded.
  Store:   http://localhost:3000/business/cyber-elias-academy
  Vendor:  cea@test.ng / Passw0rd123   (dashboard → Catalogue / Billing / Leads)
  Admin:   admin@test.ng / AdminPass123
  WhatsApp: 09058628386 · hello@cea.ng · cea.ng
  Address: 24 Ebony Road (Opp. E-Plaza), off Rumuola Road, Port Harcourt
EOF
