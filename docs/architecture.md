# CyberShop — Architecture

> Multi-vendor, WhatsApp-first business storefront & catalogue platform.
> Vendors publish a dynamic catalogue; buyers browse and convert through **pre-filled
> `wa.me` deep links** — the platform never sells to buyers, it generates *inquiries*.
> Vendors pay the platform (plans + add-ons) via bank transfer (admin-verified proof)
> or Paystack (server-verified webhook auto-activation).

Scope: Phase 1 MVP (`docs/feature-matrix.md`). Decisions: `docs/decisions.md`.
Relational design reference: `docs/schema.sql`.

---

## 1. Topology

```
                         BUYERS / VENDORS / ADMIN (browsers)
                                │  HTTPS
                                ▼
         ┌──────────────────────────────────────────────────────┐
         │  WEB — Next.js 15 (App Router, SSR) on Vercel        │
         │  • public marketplace, storefronts, item pages       │
         │  • vendor dashboard, admin console, auth             │
         │  • browser /api/* → catch-all route handler ──┐      │
         │  • server renders via /api/* (session cookie) │      │
         └───────────────────────────────────────────────┼──────┘
                                                         │ same-origin
                                                         │ + x-internal-secret
                                                         ▼
         ┌──────────────────────────────────────────────────────────┐
         │  WORKER — Cloudflare Worker (Hono, nodejs_compat)        │
         │  all business logic: auth, tenancy, catalogue, billing,  │
         │  payments, analytics, rate limits                        │
         │                                                          │
         │   ┌──────────────────┐      ┌──────────────────────────┐ │
         │   │ D1 (SQLite)      │      │ hourly cron (at :17)     │ │
         │   │ relational data  │      │ 8 idempotent jobs: sub   │ │
         │   │ + small private  │      │ expiry/grace/suspend,    │ │
         │   │ media (dev mode) │      │ scheduled publishes,     │ │
         │   │ + payment proofs │      │ addon expiry, orphan     │ │
         │   └──────────────────┘      │ media, analytics rollups,│ │
         │                             │ housekeeping             │ │
         │                             └──────────────────────────┘ │
         └──────────────────────────────────────────────────────────┘
                                      ▲
   webhook (reference extracted) ──────  ┌─────────────────────────┐
   → verified server-to-server           │ PAYSTACK hosted checkout│
                                         │ (vendor→platform money) │
                                         └─────────────────────────┘

  BROWSER (vendor media upload, "gateway" driver)
      1. POST /api/vendor/media/token → { token, uploadUrl, pathPrefix }
      2. multipart POST {token, key, file} → MEDIA GATEWAY
      3. POST /api/vendor/media/finalize (single-use token claim)
      ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  MEDIA GATEWAY — PHP 8 on the existing ~100GB cPanel host       │
  │  upload.php: HMAC token check, magic-byte MIME, size, key rules,│
  │  EXIF strip; writes /media/vendors/{id}/… and serves files as   │
  │  plain HTTPS URLs (required for WhatsApp OG previews + fast     │
  │  static delivery off Cloudflare)                                │
  └─────────────────────────────────────────────────────────────────┘

  Outbound, stateless:  wa.me/{number}?text=…  (no WhatsApp Business API — D-001)
```

**Why this placement** (D-011, final): it maps 1:1 onto the free infrastructure
that actually exists — Vercel free (Next.js SSR, the OG tags WhatsApp's crawler
needs), Cloudflare free tier (Worker + 5GB D1), and the existing cPanel host
(100GB media disk, plain HTTP static serving). No R2, no VPS, no database server.
The generic "R2/Workers" default of the master prompt is intentionally *not* used
(plan §13).

---

## 2. Request flows

### 2.1 Public browsing + WhatsApp preview cards
- All public pages are **server-rendered**: the server fetches data from the Worker
  using `sessionCookieHeader()`/`api()` (`web/lib/session.ts`) and renders
  title, description, canonical, **Open Graph** and schema.org JSON-LD.
- Buyer clicks "Chat on WhatsApp" → static `https://wa.me/{number}?text={prefill}`;
  the prefill includes the item URL, so WhatsApp's crawler (which reads OG tags,
  not JS) shows the item's image + title as a preview card in the chat.
- `POST /api/public/inquiries` (rate-limited 5/min/IP) records the lead with
  `item_name`, `business_id` and a **salted-hash of the client IP** (never raw).

### 2.2 Onboarding + free plan
`register (role=vendor)` with business details creates the business in
`pending_payment` with a `trialing` free-plan subscription (the business is not
publicly listed until `active`). Then:
- **Free plan:** `POST /api/vendor/payment-intent {plan_slug:"free"}` →
  business activates immediately (`active`, `free` subscription).
- **Paid plan:** `payment-intent` creates a `payments` row (`pending`); the
  vendor uploads proof (bank, §2.3) or pays (Paystack, §2.4); the business
  activates on verification.

**Business status machine (enforced in `lib/payments.ts` + cron):**
```
pending_payment ──proof submitted──▶ pending_approval ──admin approves──▶ active
        │                                                          ▲
        └────────────free plan / paystack success──────────────────┘
active ──cron: sub expired──▶ expired ──cron: 7-day grace over──▶ suspended
admin:  suspend / reactivate / reject (→ rejected) at any point;
        a new approved payment revives expired | grace | suspended → active
```
Only `active` businesses appear on public pages and in search.

### 2.3 Bank transfer payment (human-verified)
```
vendor: payment-intent {plan_slug, method:"bank_transfer"}
        → payments.status = 'pending' (reference CS-YYYY-XXXXXX)
        → admin bank accounts shown (from platform settings)
vendor: POST /api/vendor/payment-proof/:id  (multipart; magic-byte checked;
        stored PRIVATE in D1, never in the public web dir)
        → payments.status = 'submitted'
admin:  /admin/payments queue → download proof (admin-gated route,
        sets Content-Disposition: attachment) → approve | reject{reason}
        → approve: subscription created/extended, business → active,
          vendor notified, audit-logged (actor = admin)
        → reject: reason → vendor notification + audit
```
Proofs are *claims until a human approves* — the platform never auto-trusts
client-side "paid" state (plan §13.1).

### 2.4 Paystack (machine-verified)
- `payment-intent {method:"paystack"}` → Worker calls Paystack
  `POST /transaction/initialize` with `callback_url` =
  **`{APP_URL}/payment/status`** (a browser display page; Paystack redirects
  the buyer there after payment). The buyer lands on Paystack's hosted page.
- The Worker's **webhook** `POST /api/webhooks/paystack` is public (Paystack
  calls it) but treats the body as *untrusted*: it only extracts the
  transaction `reference`, then performs **server-to-server verification** by
  calling Paystack's `GET /transaction/verify/{reference}` with the secret key.
  Activation happens only when that authoritative API says the charge succeeded
  — the webhook body is never trusted for activation decisions. The approval is
  audit-logged with a NULL actor (system). The `/payment/status` page is a
  *display* only — it never changes payment state. (This is the robust pattern:
  even a forged webhook cannot activate a payment without a real successful
  charge on Paystack.)
- **Mock mode** (`PAYSTACK_MOCK=1`): `initiate` returns
  `{APP_URL}/paystack/mock?ref=…` which simulates success and fires the same
  webhook path, so the whole lifecycle is testable without live keys.
  Live mode activates when real `PAYSTACK_SECRET_KEY` + a registered
  webhook URL are configured (see `docs/deployment.md` §Paystack).

### 2.5 Media upload (two drivers, one contract)
`MEDIA_DRIVER` selects the backend; the web UI is identical for both.

**Gateway driver (production — files on the 100GB host):**
1. `POST /api/vendor/media/token` → quota pre-check → worker signs
   `token = b64url({t, b, e, m}) + "." + HMAC-SHA256-hex(GATEWAY_SECRET, payloadB64)`
   (10-min expiry; `b`=business id, `m`=max bytes; `t`=random part tracked in
   `upload_tokens`), stores `t` in D1 → returns `{token, uploadUrl, pathPrefix}`.
2. Browser `multipart POST {token, key, file}` straight to the cPanel
   `upload.php`, which independently verifies: HMAC, expiry, key segments
   (`[A-Za-z0-9._-]+`, no `.`/`..`), key starts with `media/vendors/{b}/`,
   magic-byte MIME (jpeg/png/webp only), extension matches MIME, size ≤
   min(token cap, hard cap), no overwrite. Writes under `/media/…`, strips
   EXIF (GD, best effort), returns
   `{storage_key, mime, size_bytes, width, height}`.
3. `POST /api/vendor/media/finalize {token, storage_key, mime, size, …}` →
   worker re-verifies signature, business match, size vs token cap, path prefix,
   then **atomically claims the token** (`UPDATE … WHERE used_at IS NULL`,
   check `meta.changes`) so replays lose the race → inserts the `media` row.

**D1 driver (dev/demo, `MEDIA_DRIVER=d1`):** browser POSTs the file to
`POST /api/vendor/media/upload` (multipart, ≤8MB, magic-byte validated) and the
Worker stores the blob in D1; served at `/api/media/file/:id`. Same 8MB cap and
validation rules, no gateway involved. (D1 free tier = 5GB — fine for demo,
never for production media.)

**Private media (payment proofs):** always stored in D1 regardless of driver;
served only by `GET /api/admin/payments/:id/proof` (admin session) and the
vendor's own billing page — never in the public tree, always
`Content-Disposition: attachment`.

### 2.6 Admin review & moderation
Vendor lifecycle management (approve/suspend/reactivate/reject — each notifies
the owner + audit-logs; statuses as in §2.2).
Unified payment queue (submitted first). Category + plan + add-on CRUD (admin is
the *only* writer). Listings oversight (search + archive). User reports queue.
Full audit log (admin + system actors). Quota enforcement happens in the Worker
on every mutating call (storage, listings, numbers, categories, staff, featured).

---

## 3. Code layout

```
web/                     Next.js 15 (App Router) — SSR everywhere (force-dynamic)
  app/
    (public)             home, /businesses, /categories, /business/[slug],
                         /business/[slug]/[segment]/[itemSlug], /search,
                         /paystack/mock, /payment/status, sitemap, robots
    (auth)               /login /register /forgot /reset-password
    dashboard/           vendor app (guarded by session+business in layout):
                         overview, catalog(+item form), media, whatsapp,
                         leads, billing, settings
    admin/               admin console (guarded by requireAdmin):
                         overview, vendors, payments, categories,
                         plans, listings, reports, audit, settings
    api/[...path]/       single catch-all route handler → Worker proxy
                         (adds x-internal-secret; forwards body/headers/cookie)
  lib/                   api.ts (worker calls), session.ts
                         (sessionCookieHeader + server session reads),
                         public-data.ts, wa.ts (wa.me prefill), format.ts

worker/                  Cloudflare Worker (Hono, nodejs_compat)
  src/index.ts           entry (fetch)
  src/app.ts             route mounting + internal-secret gate + admin boot
  src/routes/            auth, public, vendor, admin, webhook, mediafile, sitemap
  src/lib/               db, sessions, password (argon2/bcrypt), rate-limit,
                         media (tokens/finalize/d1-store), paystack, quotas,
                         notify, audit, client-ip, wa
  src/jobs/cron.ts       hourly job (8 idempotent tasks: sub expiry/grace,
                         scheduled publishes, addon expiry, orphan media,
                         analytics rollups, housekeeping)
  src/boot.ts            idempotent first-boot admin (SEED_ADMIN_*)
  migrations/            0001 init (32 tables) · 0002 seed · 0003 audit fix
  src/tests/             vitest: wa unit tests + integration suite that runs
                         against a live `wrangler dev` (real D1 + migrations)

media-gateway/           PHP 8 upload endpoint for the cPanel host
  upload.php             token/MIME/size validation + EXIF strip + write
  config.example.php     GATEWAY_SECRET / MEDIA_ROOT / caps (→ config.php, git-ignored)
  .htaccess              docroot hardening (cache headers, no indexes)
  media-htaccess.txt     → deploy as media/.htaccess (denies script execution)
  test-upload.sh         E2E smoke test for PHP-capable hosts
  contract-check.py      token-contract check vs the live worker (no PHP needed)

docs/                    this file · decisions.md (ADRs) · feature-matrix.md
                         schema.sql (canonical relational design) · deployment.md
```

### 3.1 Design system ("The Night Market" — D-012 v2)

One dark brand across the whole app; two registers:

- **Public (cinematic):** deep-green-black canvas, emerald + gold accents,
  self-hosted **Fraunces** variable serif for display (`app/fonts/Fraunces.ttf`,
  `next/font/local` — no runtime third-party font requests), glass cards, film
  grain, drifting aurora + parallax hero, per-word hero reveal, staggered
  scroll reveals (`Reveal`), Ken Burns covers, pulsing WhatsApp CTA, category
  marquee, count-up stats, curtain page transitions (`TransitionFx`), sheen
  hovers, crossfading gallery. All CSS/transform + ~60 lines of JS; no
  animation libraries; SSR + OG untouched; everything disabled under
  `prefers-reduced-motion` (content-first fallback, gated by `html.js`).
- **Dashboard/admin (clarity-first, same tokens):** fast micro-transitions
  only (row hover, active-nav indicator, button feedback) — plus one
  "empowering" exception: the bank-proof upload is a drop-zone with
  marching-ants border and a liquid fill driven by **real XHR progress**,
  ending in a drawn checkmark (haptic: double on success, deep on error).
- **v3 "Fluid Material" additions (D-018):** shared-element card ⇄ detail
  morph (`FlipBridge` in `components/Fx.tsx` — layout-level client bridge;
  the flying overlay + scrim are imperative DOM so they survive route
  unmount; reverse = swipe-down on the image or the back chip; content
  cascades in on landing), WhatsApp swipe-to-buy slider (`SwipeWa.tsx` —
  liquid fill, velocity-assisted release, confetti burst, fade-to-black),
  pointer/gyro tilt parallax + specular highlight, luminous gradient
  borders, shaped skeleton shimmers, elastic end-of-list stretch, haptic
  landscape (`lib/haptics.ts`), and per-category accent theming
  (`lib/theme.ts` → `--acc`/`--acc2` on storefront + vendor dashboard).

Note: React 19.3's `<ViewTransition>` does not interop under Next 15.5's
server-component transform (verified — renders `undefined`), so page
transitions are a custom veil (suppressed while a flip is in flight),
not the built-in component.

---

## 4. Data model (D1 — 32 tables)

Created by `worker/migrations/0001_init.sql` (the D1 source of truth;
`docs/schema.sql` is the documented relational design including the same tables).

| Area | Tables | Notes |
|---|---|---|
| Identity | `users`, `sessions`, `user_settings` | roles: vendor\|admin; session cookies (HttpOnly, 30d) |
| Tenancy | `businesses`, `business_categories`, `business_members` | business.status state machine (see §2.2) |
| Catalogue | `categories` (field_schema JSON), `item_types`, `listings` (custom_fields JSON), `item_media`, `listing_variants`, `offers` | listing.status: draft → published → archived; soft delete |
| Media | `media` (driver: d1\|gateway, visibility public\|private), `upload_tokens` | media lifecycle: uploaded → attached → unused → orphaned → deleted (cron) |
| WhatsApp | `whatsapp_numbers` | per-plan quota; each item may pin a number |
| Billing | `plans` (quota JSON, interval, trial_days), `addons` (7 types, unit price, duration), `subscriptions` (plan + period), `vendor_addons`, `payments` (reference, method, status, proof in D1) | quotas = plan + active add-ons, enforced in Worker |
| Leads | `inquiries` (status: new→contacted→interested→negotiating→converted\|lost) | salted-IP hash, never raw |
| Analytics | `analytics_events`, `analytics_daily` | WA clicks, views; rollup job |
| Trust | `reports`, `audit_logs` (actor nullable = system), `notifications`, `rate_limits`, `platform_settings` (JSON key/value: platform, bank_accounts, seo, upload_limits) | |

Key invariants enforced **server-side, on every mutation**:
- every vendor-scope query binds the session's `business_id` (no client IDs);
- plan quotas (storage bytes, listings, numbers, categories, staff, featured);
- payment state machine (proof only on `pending` + bank; approve/reject only by admin);
- media single-use tokens (atomic claim) + business-ownership prefix match.

---

## 5. Security model

| Layer | Mechanism |
|---|---|
| Browser → Vercel | session cookie (`cs_session`, HttpOnly, SameSite=Lax, Secure in prod); all mutations via same-origin `/api/*` |
| Vercel → Worker | `x-internal-secret` shared key; **only** `/api/media/file/*`, `/api/sitemap.xml`, `/api/webhooks/*`, `/healthz` are open to browsers |
| Worker tenancy | `requireVendor` / `requireAdmin` guards; ownership checked against session; IDOR-tested in the suite |
| Auth | Argon2id password hashing; per-IP salted rate limits (register 3/h, login fail 5/15min, forgot 3/h, reset 5/h, inquiry 5/min); password reset tokens (single-use, 1h) |
| Uploads | HMAC-SHA256 signed 10-min single-use tokens; magic-byte MIME (never client `type`); extension/MIME match; UUID keys; EXIF strip; private proofs never public |
| Payments | bank proof = claim until admin approval; Paystack webhook body never trusted — activation only after server-to-server `transaction/verify` with the secret key; mock mode env-gated |
| Data | soft deletes; salted IP hashes (no raw IPs); audit log for all admin mutations + payment transitions (system actors included via LEFT JOIN) |
| Media host | cPanel `media/.htaccess` denies script execution; uploads under `media/vendors/{id}/`; no overwrites |

Secrets inventory (Worker env, see §7): `AUTH_SECRET` (sessions), `INTERNAL_SECRET`
(proxy gate), `GATEWAY_SECRET` (upload tokens), `IP_SALT` (IP hashing),
`PAYSTACK_SECRET_KEY`, plus seed-admin credentials (dev convenience only).

---

## 6. Rate limits (D1-backed, per salted-IP)

register 3/h · failed login 5/15min · forgot 3/h · reset 5/h ·
inquiry 5/min · payment-proof 10/h · upload 10/10min · admin actions 30/15min.
Buckets live in `rate_limits` (hashed IP, window start) — checked before the
handler runs, on the Worker (never client-enforced).

---

## 7. Environment reference

**Worker** (`worker/.dev.vars` locally; `wrangler secret` in prod):

| Var | Purpose | Dev value | Production |
|---|---|---|---|
| `AUTH_SECRET` | session signing | dev-only | 32+ random chars |
| `INTERNAL_SECRET` | Vercel→Worker gate | dev-only | 32+ random chars (== web's `WORKER_INTERNAL_SECRET`) |
| `GATEWAY_SECRET` | upload-token HMAC | dev-only | 32+ random chars (== gateway `config.php`) |
| `IP_SALT` | IP hash salt | dev | random |
| `APP_URL` | canonical site origin (Paystack URLs, d1 media URLs) | http://localhost:3000 | https://yourdomain |
| `WEB_ORIGIN` | allowed browser origin (CORS, cookie checks) | http://localhost:3000 | https://yourdomain |
| `SESSION_SECURE` | Secure cookie flag | 0 | 1 |
| `MEDIA_DRIVER` | `d1` \| `gateway` | d1 | gateway |
| `MEDIA_BASE_URL` | public media base (OG images) | http://localhost:3000 | https://media.yourdomain |
| `GATEWAY_PUBLIC_URL` | gateway origin (token `uploadUrl`) | http://localhost:8081 | https://media.yourdomain |
| `PAYSTACK_MOCK` | 1 = mock mode | 1 | 0 with live keys |
| `PAYSTACK_PUBLIC_KEY` / `PAYSTACK_SECRET_KEY` | Paystack API | test/placeholder | live keys |
| `PAYSTACK_WEBHOOK_URL` | registered with Paystack | http://localhost:8787/api/webhooks/paystack | https://workerdomain/api/webhooks/paystack |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | first-boot admin (idempotent) | admin@test.ng / AdminPass123 | set, then change password in DB/admin |

**Web** (`web/.env.local` locally; Vercel project env in prod):
`WORKER_URL` (Worker origin), `WORKER_INTERNAL_SECRET`, `SITE_URL`.
That's all the web app needs — it never touches secrets or the DB directly.

---

## 8. Local development

```bash
# 1. worker (API + D1 local)
cd worker && npm ci
npx wrangler d1 migrations apply cybershop --local   # after any D1 state reset
cp .dev.vars.example .dev.vars                        # + SEED_ADMIN_* lines
npm run dev            # wrangler dev --port 8787

# 2. web
cd web && npm ci && cp .env.local.example .env.local
npm run dev            # next dev --port 3000

# 3. media gateway (only on a PHP-capable machine):
cd media-gateway && cp config.example.php config.php
php -S 127.0.0.1:8081 -t .
```

Demo: register a vendor and pick the Free plan (instant activation);
admin login: `admin@test.ng / AdminPass123`.

**Tests:**
- `worker`: `npm test` — 29 tests: `wa.me` prefill units + integration suite
  (onboarding, dynamic fields, bank-transfer lifecycle incl. proof
  magic-bytes, Paystack mock auto-activation, IDOR isolation, public pages,
  auth rate limits, media upload **and** gateway-token finalize/single-use).
- `web`: `tsc --noEmit` + `next build`.
- `media-gateway/contract-check.py` — verifies real worker-issued tokens
  against a faithful port of `upload.php`'s validation (10 checks; no PHP needed).
- `media-gateway/test-upload.sh` — full E2E (token → PHP upload → serve →
  finalize) for the cPanel host or any PHP 8 machine.

**Known sandbox limitation:** this repository's development sandbox has no PHP
runtime, so `upload.php` is code-reviewed + contract-verified here; the first
host run should be validated with `test-upload.sh` (deploy guide §4).

---

## 9. Free-tier limits & scaling

| Service | Free limit | Headroom for MVP |
|---|---|---|
| Worker | 100k req/day, 10ms CPU | public pages are server-rendered *on Vercel*; Worker calls are API + media files only |
| D1 | 5GB storage, 5M row-reads/day | relational + private proofs; **public media lives on cPanel, not D1** |
| Vercel | 100GB bandwidth | static-ish marketing + SSR |
| cPanel | ~100GB disk | all public vendor media |

Scaling path (no re-architecture): paid tiers of the same three services;
D1 → Postgres when >5GB relational (schema.sql is the migration reference);
media host → any static file host behind the same `MEDIA_BASE_URL` contract.

---

## 10. Build status (honest)

- **Implemented & tested:** everything in `feature-matrix.md` Phase-1 "Build"
  column — worker (29 tests), web public + vendor + admin, gateway code.
- **Verified E2E in this environment:** onboarding, free/paid plan activation
  (bank proof path), Paystack **mock** path, media (d1 driver), public pages +
  inquiry capture, admin console flows, rate limits, IDOR.
- **Pending external dependencies:** Paystack **live** keys + registered
  webhook (mock verified; live call not executed); first run of `upload.php`
  on a real PHP host (contract-verified here; `test-upload.sh` is the gate);
  production deployment (guide: `docs/deployment.md`).
