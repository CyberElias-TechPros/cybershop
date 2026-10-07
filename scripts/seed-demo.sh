#!/usr/bin/env bash
#
# CyberShop — demo data seed (idempotent).
#
# Requires the worker to be running on 127.0.0.1:8787 (bootstrap-dev.sh +
# `cd worker && npm run dev`). Safe to re-run: it creates what is missing and
# updates what is already there, so a store seeded with an older course list
# converges on the current one instead of erroring on duplicate slugs.
#
#   • vendor  cea@test.ng / Passw0rd123 — "Cyber Elias Academy" (Port Harcourt)
#   • the 13 core short courses published on cea.ng, with their current
#     published fees, durations, levels, session counts and practical outcomes
#   • store profile photo, cover photo and course photos (scripts/seed-demo/*.jpg)
#   • a demo voice note on Web Development
#   • billing demo state: 1 approved payment (proof attached) + 1 pending
#
# Usage:  ./scripts/seed-demo.sh
set -euo pipefail
cd "$(dirname "$0")/.."

B=http://127.0.0.1:8787/api
A=scripts/seed-demo
SECRET=$(grep '^INTERNAL_SECRET=' worker/.dev.vars | cut -d= -f2)
J='content-type: application/json'
COOKIE=/tmp/cs-seed-cea.txt
ADMIN_COOKIE=/tmp/cs-seed-admin.txt
ADMIN_EMAIL=$(grep '^SEED_ADMIN_EMAIL=' worker/.dev.vars | cut -d= -f2 || echo 'admin@test.ng')
ADMIN_PASSWORD=$(grep '^SEED_ADMIN_PASSWORD=' worker/.dev.vars | cut -d= -f2 || echo 'AdminPass123')

# worker up?
if ! curl -s -o /dev/null --max-time 3 http://127.0.0.1:8787/healthz; then
  echo "error: worker is not running on 127.0.0.1:8787 — start it first (cd worker && npm run dev)"
  exit 1
fi

# already fully seeded? (store exists AND carries the 13 current courses AND
# has a profile photo — a login alone proves nothing: an earlier run may have
# died mid-way, and an older run seeded 10 courses from a stale flyer)
already_seeded() {
  curl -s -H "x-internal-secret: $SECRET" \
    "$B/public/business/cyber-elias-academy" \
    | python3 -c 'import json,sys
try: d = json.load(sys.stdin)
except Exception: sys.exit(1)
b = d.get("business") or {}
items = b.get("items") or []
# Also require the platform-owner mark, so a store seeded before the
# entitlement existed is upgraded rather than left on a paid plan.
sys.exit(0 if len(items) >= 13 and b.get("logo") and b.get("is_platform_owner") else 1)' 2>/dev/null
}
if already_seeded; then
  echo "✓ demo data already current (cyber-elias-academy, 13 courses, profile photo) — nothing to do."
  exit 0
fi
rm -f "$COOKIE" "$ADMIN_COOKIE"

echo "→ registering demo vendor (Cyber Elias Academy)…"
REG=$(curl -s -c "$COOKIE" -H "x-internal-secret: $SECRET" -H "$J" -X POST $B/auth/register -d '{
  "role":"vendor","name":"Cyber Elias","email":"cea@test.ng","password":"Passw0rd123","phone":"09058628386",
  "business_name":"Cyber Elias Academy","slug":"cyber-elias-academy","category_slug":"academy",
  "whatsapp_number":"2349058628386","city":"Port Harcourt","state_region":"Rivers"
}')
echo "$REG" | grep -q '"ok":true' || {
  # vendor may already exist from a partially-failed run → log in instead
  echo "   register skipped — logging in…"
  curl -s -c "$COOKIE" -H "x-internal-secret: $SECRET" -H "$J" -X POST $B/auth/login \
    -d '{"email":"cea@test.ng","password":"Passw0rd123"}' | grep -q '"ok":true' || { echo "error: demo vendor exists but login failed"; exit 1; }
}

json() { python3 -c "import json,sys; d=json.load(sys.stdin); print(d$1)"; }

sid() { # Netscape cookie file → cs_session value (HttpOnly lines keep a '#' prefix)
  python3 -c "
import sys
sid=''
for line in open(sys.argv[1]):
    if 'cs_session' in line and (not line.startswith('#') or line.startswith('#HttpOnly_')):
        sid = line.split('\t')[-1].strip()
print(sid)" "$1"
}

echo "→ Cyber Elias Academy is the platform owner — granting the top plan, permanently, free…"
# CyberShop is CEA's own platform, so CEA's store is entitled to Enterprise
# forever: no invoice, no expiry, no renewal. That is a real platform
# entitlement (worker/src/lib/entitlement.ts), not a seeded shortcut — the
# hourly cron re-asserts it and the expiry sweep cannot touch it.
#
# Fallback: if no admin account exists yet (first boot with no
# SEED_ADMIN_* secrets), buy Starter the honest way — intent → bank proof →
# admin approval — so the 13 courses still fit under the 10-item free cap.
rm -f "$ADMIN_COOKIE"
curl -s -c "$ADMIN_COOKIE" -H "x-internal-secret: $SECRET" -H "$J" -X POST $B/auth/login \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | grep -q '"ok":true' \
  || echo "   (admin login unavailable — falling back to a paid plan for the demo store)"
SID=$(sid "$ADMIN_COOKIE")
BIZ_ID=$(curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -H "$J" $B/vendor/business \
  | python3 -c 'import json,sys
try: print((json.load(sys.stdin).get("business") or {}).get("id") or "")
except Exception: print("")')
GRANTED=0
if [ -n "${SID:-}" ] && [ -n "${BIZ_ID:-}" ]; then
  GRANT=$(curl -s -H "x-internal-secret: $SECRET" -H "$J" -H "cookie: cs_session=$SID" \
    -X POST $B/admin/vendors/$BIZ_ID/entitlement -d '{
      "plan_slug":"enterprise",
      "reason":"CyberShop is Cyber Elias Academy'"'"'s own platform — the academy'"'"'s store runs on the highest package permanently, at no cost.",
      "is_platform_owner":true
    }')
  echo "$GRANT" | grep -q '"ok":true' && GRANTED=1
fi
if [ "$GRANTED" = "1" ]; then
  echo "   Enterprise granted permanently — verified, featured, never expires, never billed."
else
  echo "   entitlement unavailable — buying Starter so the 13 courses fit (10-item free cap)…"
  P0=$(curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -H "$J" \
    -X POST $B/vendor/payment-intent -d '{"plan_slug":"starter","method":"bank_transfer"}' | json "['payment']['id']")
  curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" \
    -X POST $B/vendor/payment-proof/$P0 -F "proof=@$A/course1.jpg;type=image/jpeg" >/dev/null
  if [ -n "${SID:-}" ]; then
    curl -s -H "x-internal-secret: $SECRET" -H "$J" -H "cookie: cs_session=$SID" \
      -X POST $B/admin/payments/$P0/approve >/dev/null
    echo "   starter plan approved (100 catalogue items)."
  else
    echo "   (approve payment $P0 in the admin console to lift the 10-item cap)"
  fi
fi

echo "→ store profile…"
curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -H "$J" -X PUT $B/vendor/business -d '{
  "name":"Cyber Elias Academy",
  "slug":"cyber-elias-academy",
  "about":"From Zero to Expert, Together.\n\nLearn practical digital skills for a brighter future — beginner friendly, affordable and flexible, with a certificate on completion and expert instructors.\n\nNew skills. Real opportunities.\n\nCourses on the board (₦):\n• Microsoft Office — 30,000 / 3 weeks\n• Typing & Computer Basics — 20,000 / 2 weeks\n• Graphic Design — 40,000 / 4 weeks\n• Web Design — 50,000 / 4 weeks\n• Digital Marketing — 40,000 / 4 weeks\n• Social Media Management — 30,000 / 3 weeks\n• Data Entry — 20,000 / 2 weeks\n• Computer Repairs — 50,000 / 4 weeks\n• Web Development — 60,000 / 6 weeks\n• Cybersecurity — 50,000 / 4 weeks\n• Business & Freelancing — 30,000 / 3 weeks\n• Content Creation — 30,000 / 3 weeks\n• Online Teaching — 30,000 / 3 weeks\n\nShort practical courses, two sessions a week. Walk in at 24 Ebony Road (Opp. E-Plaza), off Rumuola Road, Port Harcourt — or message us on WhatsApp.",
  "phone":"09058628386",
  "email":"hello@cea.ng",
  "address":"24 Ebony Road (Opp. E-Plaza), off Rumuola Road",
  "city":"Port Harcourt",
  "state_region":"Rivers",
  "website":"https://cea.ng"
}' >/dev/null

echo "→ uploading demo media…"
A1=$(curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -X POST $B/vendor/media/upload -F "file=@$A/course1.jpg;type=image/jpeg" | json "['media']['id']")
A2=$(curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -X POST $B/vendor/media/upload -F "file=@$A/course2.jpg;type=image/jpeg" | json "['media']['id']")
AC=$(curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -X POST $B/vendor/media/upload -F "file=@$A/cover.jpg;type=image/jpeg" | json "['media']['id']")
AL=$(curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -X POST $B/vendor/media/upload -F "file=@$A/logo.jpg;type=image/jpeg" | json "['media']['id']")

echo "→ publishing the 13 Cyber Elias Academy courses…"
WEB_ID=$(SECRET="$SECRET" COOKIE="$COOKIE" B="$B" A1="$A1" A2="$A2" python3 - <<'PY'
import json, os, sys, urllib.request

secret, base = os.environ["SECRET"], os.environ["B"]
# Netscape cookie file → cs_session value. HttpOnly cookies are stored as
# "#HttpOnly_<domain>…" — a '#' prefix that must NOT be treated as a comment.
sid = ""
for line in open(os.environ["COOKIE"]):
    if "cs_session" in line and (not line.startswith("#") or line.startswith("#HttpOnly_")):
        sid = line.split("\t")[-1].strip()
a1, a2 = int(os.environ["A1"]), int(os.environ["A2"])

# The 13 core short courses currently published on cea.ng: name, slug, fee
# (kobo), duration, sessions, level, what the learner produces, sales copy,
# curriculum and the SEO pair. Descriptions are written to sell honestly —
# copied marketing text reads as filler next to a real price.
FOOT = "\n\nIn person at 24 Ebony Road (Opp. E-Plaza), off Rumuola Road, Port Harcourt. WhatsApp 09058628386 for the next start date."

COURSES = [
  dict(slug="microsoft-office", name="Microsoft Office", price=3000000,
    duration="3 weeks", sessions="6 sessions · 2 per week", level="Absolute beginner",
    outcome="A professional document, a working spreadsheet with formulas and charts, and a 5–7 slide presentation.",
    desc="Learn practical Microsoft Office skills for school, work and business. Build professional documents, spreadsheets and presentations while learning the tools you can actually use in everyday work.\n\nIdeal for beginners, office workers, students, NYSC members, church/NGO staff and small-business owners.",
    curriculum="Word documents and formatting, Excel formulas and charts, PowerPoint slides, file management and professional printing.",
    seo_title="Microsoft Office Course in Port Harcourt | Cyber Elias Academy",
    seo_desc="Learn practical Microsoft Word, Excel and PowerPoint skills at Cyber Elias Academy in Port Harcourt. 3-week beginner course for ₦30,000."),

  dict(slug="typing-computer-basics", name="Typing & Computer Basics", price=2000000,
    duration="2 weeks", sessions="4 sessions · 2 per week", level="Absolute beginner",
    outcome="A demonstrated set of everyday computer tasks completed on your own.",
    desc="Start from the very beginning and become comfortable using a computer independently. Learn the keyboard, mouse, files and folders, internet browsing, email and everyday computer tasks through hands-on practice.\n\nNo previous computer experience required. Academy computers can be used for this course.",
    curriculum="Keyboard and touch typing, mouse control, files and folders, browsing, email and everyday computer care.",
    seo_title="Computer Basics & Typing Course in Port Harcourt",
    seo_desc="Learn computer basics, typing, files, internet and email from scratch at Cyber Elias Academy. 2-week absolute beginner course for ₦20,000."),

  dict(slug="graphic-design", name="Graphic Design", price=4000000,
    duration="4 weeks", sessions="8 sessions · 2 per week", level="Beginner",
    outcome="A mini brand package: logo, flyer, social media post and business card.",
    desc="Learn how to turn ideas into clear, professional visual designs. This practical beginner course covers design principles and hands-on production for flyers, social media graphics, logos and business materials.",
    curriculum="Design principles, colour and typography, layout, logo basics, flyers, social media graphics and print-ready files.",
    seo_title="Graphic Design Course in Port Harcourt | Cyber Elias Academy",
    seo_desc="Learn practical graphic design and create a mini brand package with a logo, flyer, social media design and business card. ₦40,000."),

  dict(slug="web-design", name="Web Design", price=5000000,
    duration="4 weeks", sessions="8 sessions · 2 per week", level="Beginner",
    outcome="A published, responsive 3–5 page website that works on mobile.",
    desc="Learn how to design, build and publish a real website — not just a mockup. Understand domains, hosting, HTML, CSS, responsive layouts and the basic structure of a business website.",
    curriculum="Domains and hosting, HTML structure, CSS styling, responsive layouts, page planning and going live.",
    seo_title="Web Design Course in Port Harcourt | Cyber Elias Academy",
    seo_desc="Learn HTML, CSS, responsive design and website publishing by building a real 3–5 page website at Cyber Elias Academy."),

  dict(slug="digital-marketing", name="Digital Marketing", price=4000000,
    duration="4 weeks", sessions="8 sessions · 2 per week", level="Beginner",
    outcome="A complete digital marketing campaign: audience research, strategy, content calendar, ad concepts and a reporting framework.",
    desc="Learn how to plan, run and measure digital marketing campaigns that are designed to generate real business results. Understand audiences, value propositions, content, advertising and campaign measurement.",
    curriculum="Audience research, offers and value proposition, content planning, paid ads, landing pages and campaign measurement.",
    seo_title="Digital Marketing Course in Port Harcourt | Cyber Elias Academy",
    seo_desc="Learn practical digital marketing, campaign planning, content strategy, advertising and analytics at Cyber Elias Academy. ₦40,000."),

  dict(slug="social-media-management", name="Social Media Management", price=3000000,
    duration="3 weeks", sessions="6 sessions · 2 per week", level="Beginner",
    outcome="A 7-day content calendar with graphics and captions, plus a practical mock social media management report.",
    desc="Learn how to manage a business social media account professionally. Plan content, create captions and graphics, engage with customers, manage messages and understand basic performance reporting.",
    curriculum="Content planning, caption writing, simple graphics, community management, inbox handling and performance reporting.",
    seo_title="Social Media Management Course in Port Harcourt",
    seo_desc="Learn practical social media management, content planning, customer engagement and reporting at Cyber Elias Academy. 3 weeks, ₦30,000."),

  dict(slug="data-entry", name="Data Entry", price=2000000,
    duration="2 weeks", sessions="4 sessions · 2 per week", level="Beginner",
    outcome="A cleaned, validated and organised dataset with a summary sheet.",
    desc="Build the accuracy and spreadsheet skills needed for reliable data-entry work. Learn how to organise records, identify errors, clean information and produce properly formatted datasets.",
    curriculum="Spreadsheet navigation, data types, sorting and filtering, validation, cleaning, formatting and summary reporting.",
    seo_title="Data Entry Course in Port Harcourt | Cyber Elias Academy",
    seo_desc="Learn accurate data entry, spreadsheet organisation, data cleaning and validation in this practical 2-week course. ₦20,000."),

  dict(slug="computer-repairs", name="Computer Repairs", price=5000000,
    duration="4 weeks", sessions="8 sessions · 2 per week", level="Beginner",
    outcome="A diagnosed and serviced computer, with customer-style service documentation.",
    desc="Learn the practical foundations of diagnosing, servicing and maintaining computers. Work through real troubleshooting scenarios and learn how to identify faults, perform repairs and document completed service work.",
    curriculum="Hardware identification, fault diagnosis, upgrades, operating system reinstalls, maintenance routines and service documentation.",
    seo_title="Computer Repairs Course in Port Harcourt | Cyber Elias Academy",
    seo_desc="Learn practical computer troubleshooting, diagnosis, servicing and maintenance at Cyber Elias Academy. 4-week beginner course."),

  dict(slug="web-development", name="Web Development", price=6000000,
    duration="6 weeks", sessions="12 sessions · 2 per week", level="Beginner",
    outcome="A working, responsive web project published online.",
    desc="Go beyond basic web design and learn the foundations of building interactive websites and applications. Learn HTML, CSS, JavaScript, DOM manipulation, forms and practical project development.\n\nThis is the deeper course: fewer pictures, more working software. Take Web Design first if you have never built a page.",
    curriculum="HTML and CSS foundations, JavaScript, the DOM, forms and validation, responsive layouts, project structure and publishing.",
    seo_title="Web Development Course in Port Harcourt | Cyber Elias Academy",
    seo_desc="Learn HTML, CSS, JavaScript and practical web development by building and publishing a functional web project. ₦60,000."),

  dict(slug="cybersecurity", name="Cybersecurity", price=5000000,
    duration="4 weeks", sessions="8 sessions · 2 per week", level="Beginner",
    outcome="A practical security assessment and improvement report.",
    desc="Learn the practical foundations of cybersecurity from a defensive and ethical perspective. Understand threats, vulnerabilities, account security, phishing, malware awareness, network security, web security and basic incident response.\n\nAll demonstrations are safe and isolated — this is defensive training, not hacking.",
    curriculum="Threats and vulnerabilities, account and password security, phishing and malware awareness, network and web security, incident response basics.",
    seo_title="Cybersecurity Course in Port Harcourt | Cyber Elias Academy",
    seo_desc="Learn practical cybersecurity fundamentals, digital safety, threat awareness, network security and incident response. 4 weeks, ₦50,000."),

  dict(slug="business-freelancing", name="Business & Freelancing", price=3000000,
    duration="3 weeks", sessions="6 sessions · 2 per week", level="Beginner",
    outcome="A one-page freelance business plan and a portfolio containing three practical case studies.",
    desc="Learn how to turn a practical digital skill into a service people can pay for. Develop your service offering, pricing, target market, client acquisition approach, proposals and professional portfolio.",
    curriculum="Packaging a service, pricing and costing, target market, client acquisition, proposals and contracts, portfolio building.",
    seo_title="Business & Freelancing Course in Port Harcourt",
    seo_desc="Learn how to package, price and sell your digital skills as freelance services. Build a portfolio and a freelance business plan."),

  dict(slug="content-creation", name="Content Creation", price=3000000,
    duration="3 weeks", sessions="6 sessions · 2 per week", level="Beginner",
    outcome="A finished short-form educational or promotional video with script, editing, captions and thumbnail.",
    desc="Learn how to plan, shoot, edit and publish useful photo and video content for brands, businesses and personal projects. Focus on practical production rather than simply learning software buttons.",
    curriculum="Content planning and scripting, shooting with a phone, lighting and sound, editing, captions, thumbnails and publishing.",
    seo_title="Content Creation Course in Port Harcourt | Cyber Elias Academy",
    seo_desc="Learn practical content creation, video planning, shooting, editing, captions and publishing at Cyber Elias Academy. ₦30,000."),

  dict(slug="online-teaching", name="Online Teaching", price=3000000,
    duration="3 weeks", sessions="6 sessions · 2 per week", level="Beginner",
    outcome="A complete lesson plan, teaching slides and a recorded short online lesson.",
    desc="Learn how to turn what you know into an effective online lesson. Plan lessons, create teaching materials, deliver online classes and assess learners using practical teaching methods.",
    curriculum="Lesson planning, learning objectives, slide and material design, online delivery, engagement and assessment.",
    seo_title="Online Teaching Course in Port Harcourt | Cyber Elias Academy",
    seo_desc="Learn how to plan, deliver and assess online lessons. Build teaching materials and practise delivering an online class."),
]

KEEP = {c["slug"] for c in COURSES}


def req(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    r = urllib.request.Request(base + path, method=method, data=data)
    r.add_header("content-type", "application/json")
    r.add_header("x-internal-secret", secret)
    r.add_header("cookie", f"cs_session={sid}")
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw.strip().startswith("{") else {}
    except urllib.error.HTTPError as e:
        return {"__error": e.code, "__body": e.read().decode()[:300]}


# What is already on the shelf? Update in place; only POST what is missing —
# that is what makes a re-run (and an older 10-course seed) converge.
existing = {}
for status in ("published", "draft", "archived"):
    d = req("GET", f"/vendor/items?status={status}&page=1")
    for it in (d.get("items") or []):
        existing[it.get("slug")] = it.get("id")

for slug, item_id in list(existing.items()):
    if slug not in KEEP:
        req("DELETE", f"/vendor/items/{item_id}")
        print(f"   removed out-of-date course: {slug}", file=sys.stderr)
        existing.pop(slug)

web_id = None
for i, c in enumerate(COURSES):
    mid = a1 if i % 2 == 0 else a2
    body = {
        "name": c["name"],
        "slug": c["slug"],
        "item_type_slug": "course",
        "category_slug": "academy",
        "description": c["desc"] + FOOT,
        "price_kobo": c["price"],
        "price_type": "fixed",
        "stock_status": "n_a",
        "featured": False,
        "custom_fields": {
            "duration": c["duration"],
            "sessions": c["sessions"],
            "skill_level": c["level"],
            "delivery_mode": "In-person",
            "certification": True,
            "instructor": "Cyber Elias Academy",
            "outcome": c["outcome"],
            "curriculum": c["curriculum"],
        },
        "media_ids": [mid],
        "seo_title": c["seo_title"],
        "seo_description": c["seo_desc"],
        "publish": True,
    }
    out = req("PUT", f"/vendor/items/{existing[c['slug']]}", body) if c["slug"] in existing \
        else req("POST", "/vendor/items", body)
    if "__error" in out:
        raise SystemExit(f"seed: {c['slug']} -> HTTP {out['__error']}: {out['__body']}")
    if c["slug"] == "web-development":
        web_id = existing.get("web-development") or out.get("id")
    print(f"   {c['name']:<28} ₦{c['price']/100:,.0f}  ·  {c['duration']}", file=sys.stderr)

print(web_id or "")
PY
)

echo "→ setting store cover + profile photo…"
curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -H "$J" \
  -X POST $B/vendor/business/media -d "{\"field\":\"cover\",\"media_id\":$AC}" >/dev/null
curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -H "$J" \
  -X POST $B/vendor/business/media -d "{\"field\":\"logo\",\"media_id\":$AL}" >/dev/null

if [ -n "${WEB_ID:-}" ]; then
  echo "→ attaching the demo voice note to Web Development…"
  AA=$(curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -X POST $B/vendor/media/upload-audio -F "file=@$A/demo-voice.wav;type=audio/wav" | json "['media']['id']")
  python3 - <<PY
import json, os, urllib.request
secret = """$SECRET"""
sid = ""
for line in open("$COOKIE"):
    # "#HttpOnly_…" lines are cookie records, not comments
    if "cs_session" in line and (not line.startswith("#") or line.startswith("#HttpOnly_")):
        sid = line.split("\t")[-1].strip()
req = urllib.request.Request("$B/vendor/items/$WEB_ID", method="GET")
req.add_header("x-internal-secret", secret)
req.add_header("cookie", f"cs_session={sid}")
with urllib.request.urlopen(req) as r:
    item = json.loads(r.read().decode())["item"]

body = {
    "name": item["name"],
    "slug": item["slug"],
    "item_type_slug": item.get("item_type_slug") or "course",
    "category_slug": item.get("category_slug") or "academy",
    "description": item.get("description"),
    "price_kobo": item.get("price"),
    "price_type": item.get("price_type") or "fixed",
    "stock_status": item.get("stock_status") or "n_a",
    "featured": False,
    "custom_fields": item.get("custom_fields") or {},
    "media_ids": [m["id"] for m in (item.get("images") or [])],
    "seo_title": item.get("seo_title"),
    "seo_description": item.get("seo_description"),
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

echo "→ billing demo state (1 approved + 1 pending)…"
curl -s -b "$COOKIE" -H "x-internal-secret: $SECRET" -H "$J" \
  -X POST $B/vendor/payment-intent -d '{"plan_slug":"starter","method":"bank_transfer"}' >/dev/null

cat <<EOF

✓ Demo data seeded.
  Store:   http://localhost:3000/business/cyber-elias-academy
  Vendor:  cea@test.ng / Passw0rd123   (dashboard → Catalogue / Billing / Leads)
  Admin:   admin@test.ng / AdminPass123
  Courses: 13 core CEA short courses (₦20,000 – ₦60,000)
  WhatsApp: 09058628386 · hello@cea.ng · cea.ng
  Address: 24 Ebony Road (Opp. E-Plaza), off Rumuola Road, Port Harcourt
EOF
