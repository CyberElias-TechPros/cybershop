# CyberShop

**Find a business. Talk to it on WhatsApp.**

CyberShop is a multi-vendor, WhatsApp-first business storefront & catalogue
platform. Vendors (any industry — fashion, tech academy, salon, restaurant,
real estate, consultant…) publish a professional storefront with a dynamic
catalogue. Buyers browse and convert directly on **WhatsApp** via pre-filled
`wa.me` deep links — no shopping cart, no platform-side payment to buyers,
no WhatsApp Business API. Vendors pay the platform (admin-defined plans +
add-ons) by bank transfer (admin-verified proof) or Paystack (auto-activation
via verified webhook).

```
Vendor:  Register → plan (free / paid) → catalogue (dynamic fields per industry)
         → WhatsApp numbers → leads
Buyer:   Discover → storefront → item page → [ Enquire on WhatsApp ] → wa.me
Admin:   Vendor approvals · payment verification · categories · plans &
         add-ons · listings oversight · reports · audit logs
```

## Documentation

| Document | Contents |
|---|---|
| [`plan.md`](plan.md) | The full product plan & confirmed decisions (source of truth for scope) |
| [`docs/architecture.md`](docs/architecture.md) | Topology, request flows, data model, security, env reference, build status |
| [`docs/deployment.md`](docs/deployment.md) | Step-by-step production deployment (Cloudflare + Vercel + cPanel) |
| [`docs/feature-matrix.md`](docs/feature-matrix.md) | Phase 1 feature matrix + test priority |
| [`docs/decisions.md`](docs/decisions.md) | Decision ledger (D-001…D-018) |
| [`docs/schema.sql`](docs/schema.sql) | Canonical relational design (D1 migrations in `worker/migrations/` are the runtime source of truth) |
| [`docs/usability-audit.md`](docs/usability-audit.md) | Front-end usability/accessibility audit: what blocked visitors, what was fixed, what is still recommended |

## Key decisions (summary — full text in `docs/decisions.md`)

- **Stack (D-011):** Next.js 15 SSR on **Vercel** · Hono Worker + **D1** on
  **Cloudflare** (all business logic) · PHP media gateway on the vendor's
  existing **~100GB cPanel host** (public media as plain HTTPS URLs —
  required for WhatsApp preview cards). No R2, no VPS.
- **WhatsApp (D-001):** `wa.me` deep links only. The item URL inside the
  prefill + SSR Open Graph tags give WhatsApp a rich preview card.
- **Dynamic categories (D-003):** each category carries an admin-defined
  **JSON field schema**; items store values as JSON. New industries = new
  category, no code deploy.
- **Payments (D-004, D-017):** vendor→platform only. Bank transfer + proof
  (a *claim* until an admin approves) **or** Paystack hosted checkout — the
  webhook body is never trusted; activation requires a server-to-server
  `transaction/verify`. Mock mode for dev.
- **Monetization (D-006):** admin-defined plans (quota JSON: WhatsApp numbers,
  storage, listings, categories, staff, featured) + separately priced add-ons.
  Quotas enforced server-side on every mutation.
- **Buyers (D-005):** optional accounts; guests browse and chat with zero
  friction. **Leads, not orders (D-007):** the platform records inquiries;
  sales happen on WhatsApp.
- **Security (D-009, D-014):** session cookies + per-IP rate limits,
  server-side tenancy (IDOR-tested), magic-byte upload validation, HMAC-signed
  single-use media tokens, audit log, salted IP hashes.

## Repository layout

```
web/            Next.js 15 app (SSR): public site, vendor dashboard, admin,
                same-origin /api/* proxy to the Worker
worker/         Cloudflare Worker (Hono) + D1: auth, catalogue, billing,
                payments, webhooks, cron jobs; vitest suite
media-gateway/  PHP 8 upload endpoint for the cPanel host (+ config, .htaccess,
                test-upload.sh E2E harness, contract-check.py)
scripts/        bootstrap-dev.sh (one-command local env) + seed-demo.sh
                (idempotent demo data, assets under scripts/seed-demo/)
docs/           architecture · deployment · decisions · feature-matrix · schema
```

## Local development

Prereqs: Node 20+, npm. (Optional: PHP 8 for the media gateway — dev mode
doesn't need it.)

```bash
# One-command local environment (deps + env files + migrations), then start:
./scripts/bootstrap-dev.sh --seed    # --seed also creates the demo store
cd worker && npm run dev             # API  → http://127.0.0.1:8787
cd web && npm run dev                # web  → http://localhost:3000
```

<details>
<summary>Manual equivalent (no bootstrap)</summary>

```bash
# 1. API Worker + local D1  →  http://127.0.0.1:8787
cd worker && npm ci
npx wrangler d1 migrations apply cybershop --local
cp .dev.vars.example .dev.vars      # dev-only secrets + SEED_ADMIN_* lines
npm run dev

# 2. Web app  →  http://localhost:3000
cd web && npm ci
cp .env.local.example .env.local
npm run dev
```
</details>

- Admin (auto-seeded on first request): **admin@test.ng / AdminPass123**
- Demo vendor: register as a vendor and pick the **Free** plan (instant
  activation), or test the full bank-transfer flow: paid plan → upload proof →
  approve as admin.
- Media driver is `d1` in dev (files in D1). The cPanel gateway is exercised
  via `media-gateway/test-upload.sh` on a PHP-capable machine.

## Tests

```bash
cd worker && npm test        # 56 tests: password-hashing + wa.me prefill units + full
                             # integration suite (onboarding, both payment paths, media
                             # upload + gateway-token finalize/single-use,
                             # IDOR isolation, public pages, rate limits,
                             # WhatsApp multi-item cart, voice-note audio)
cd web && npx tsc --noEmit && npm run build
python3 media-gateway/contract-check.py   # worker tokens vs gateway validation
```

## Production

See [`docs/deployment.md`](docs/deployment.md) — Cloudflare D1 + Worker →
cPanel media gateway → Vercel web, with a Paystack section and a launch
checklist. Free-tier headroom and the scaling path are in
`docs/architecture.md` §9.

## Roadmap

- **Phase 1 (MVP):** ✅ built — onboarding + both payment paths, dynamic
  categories/fields, catalogue CRUD, media + quotas, SSR storefronts (OG +
  structured data), wa.me CTA + lead capture, **WhatsApp multi-item cart
  (Plan §30 — still a lead, never a checkout)**, **vendor voice notes**
  (record → waveform player on item pages), vendor dashboard, full admin
  console, audit logs, scheduled jobs (expiry/grace, orphan cleanup, rollups).
- **Support & growth pass:** transactional email (Resend/MailChannels — resets,
  receipts, renewal reminders, lead alerts), printable payment receipts, QR
  codes + WhatsApp-Status sharing for storefronts, catalogue/leads CSV export,
  admin user directory with audited sign-in-as + resend-reset, admin-editable
  WhatsApp templates (live, no deploy), Terms/Privacy/Contact pages, default
  OG share image, PWA install support, gateway image downscaling (1600px).
- **Hardening pass (this branch):** fixed the password hash/verify mismatch that
  made **every login fail** (now PBKDF2-SHA256, 100k iterations, with
  transparent upgrade of legacy hashes at login); market feed pages
  (/listings, /businesses, /search) now render fully server-side for crawlers;
  canonical + og:url metadata on every public page; cinematic split-screen
  auth + art-directed onboarding plan ceremony; seed script fixes
  (#HttpOnly cookie parsing, resumable re-runs).
- **Phase 2–3 (this branch):** leads CRM with buyer status updates, CSV import,
  staff seats, storefront sections, saved stores, share + QR, search filters
  (including category field filters) and suggestions, enquiry-backed reviews,
  blocks, custom-domain DNS verify, vendor pause (catalogue stays, market
  hides), admin extend/revoke/feature/refund, and a vendor referral credit
  (10% of the referred store’s first paid plan, capped, applied to the next
  plan — not cash; refunds take it back).
- **Not in this product:** checkout, orders, WhatsApp Business Cloud API,
  extra payment providers, a native app, or AI copy. Those would change what
  the market is. Deep links remain how a sale starts.
