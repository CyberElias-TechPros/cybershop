# Cybershop

A multi-tenant **business storefront + catalogue platform** where WhatsApp is the conversion channel. A vendor publishes a catalogue (products, courses, services, appointments, properties — anything), and a buyer's "buy" tap opens WhatsApp with the details already typed out. The platform never touches the money between them.

- **Product intent:** [`plan.md`](./plan.md) (the original brief, §0–§80)
- **Engineering plan:** [`BUILD_PLAN.md`](./BUILD_PLAN.md) — stack decision, data model, contracts, milestones M0–M17, risks
- **Section-by-section coverage:** [`docs/TRACEABILITY.md`](./docs/TRACEABILITY.md)
- **Data model:** [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md) · `src/db/schema.ts` is the authority
- **Media gateway (deployable PHP for your shared host):** [`docs/media-gateway/gateway.php`](./docs/media-gateway/gateway.php)

## Quick start

```bash
npm install
npm run db:reset     # embedded Postgres (PGlite) in ./.data/pgdata - no server needed
npm run db:seed      # demo verticals, two stores, items, a pending payment
npm run dev          # http://localhost:3000
```

| Where | What |
|---|---|
| `/` | discovery home + search |
| `/discover?type=course&filter=mode&fval=online` | faceted search that queries the dynamic-field store |
| `/business/amara-fashion/product/ankara-maxi-dress` | item page — view source to see the server-rendered `og:` tags and JSON-LD |
| `/dashboard` | vendor: overview, catalogue, media, WhatsApp, enquiries, storefront, settings |
| `/admin` | payments queue, businesses, categories/types/field builder |

Sign in as `hello@amarafashion.test` / `Cybershop#2026` (vendor) or `admin@cybershop.test` / `Cybershop#2026` (admin).

```bash
npm run verify       # the two suites that must never go red: deep-link builder + field/authz rules
npm run lint         # tsc --noEmit
npm run jobs:run     # media orphan sweep, subscription expiry, usage recount
```

## Stack

Next.js 15 (App Router, RSC + Server Actions) · TypeScript strict · Tailwind v4 · Drizzle + Postgres (PGlite in dev, Neon/Vercel Postgres in prod) · media through a pluggable driver (local in dev, HMAC-signed PHP gateway on your shared host in prod).

Three rules the whole codebase follows:

1. **Tenant scoping is derived from the session, never the request body.** Every vendor mutation starts with `requireMembership(businessId, permission)`.
2. **The catalogue schema is data, not code.** `src/core/fields.ts` is one registry driving validation, form rendering, WhatsApp message lines, filters and search — which is why "can I use this for my business?" is an admin config change.
3. **Bytes never pass through a function.** Metadata goes through the app; file bodies go browser → media host, so upload size is limited by your hosting, not by a serverless timeout.

## Read this before you charge anyone

Vercel **Hobby is licensed for personal, non-commercial use only** and is enforced by project suspension; its limits also hard-pause a project rather than billing you. Build on Hobby, then move to Vercel Pro (or deploy the same code to Cloudflare) **before** the first vendor pays — see `BUILD_PLAN.md` §2.3 and launch gate §26.

Only one process may hold the local PGlite data directory at a time. If `npm run dev` is running, don't run `npm run db:seed` in a second shell.
