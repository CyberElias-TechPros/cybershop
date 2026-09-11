# Cybershop — Build Plan

**Status:** v1, approved-for-build · **Date:** 2026-09-10 · **Repos:** `CyberElias-TechPros/cybershop`
**Source of truth for *product* intent:** [`plan.md`](./plan.md) (3,412 lines, §0–§80).
**This document** is the *engineering* plan: it turns that product vision into decisions, data model, contracts, and an ordered build. Where it contradicts `plan.md`, this document wins and the contradiction is listed in §1.

---

## 0. Read this first

`plan.md` is a very good **product** document that was assembled from two different advisory passes, so it contains one architectural contradiction, one factual error, and one legal problem. All three are resolved here.

| # | Problem in `plan.md` | Resolution |
|---|---|---|
| 1 | **Two contradictory stacks.** §9 + §13.7 recommend Node/PHP + Postgres on own hosting and explicitly reject "the full Cloudflare Workers/D1/R2/KV/Durable Objects/Queues architecture". §47/§48 + §80 then recommend Vercel + **Cloudflare Worker + D1 + KV** as the target architecture. Both halves claim the other is wrong. | Resolved in **§1–§2**: Next.js full-stack on Vercel + **Postgres** (not D1), media on your shared host. D1/Workers documented as the deliberate fallback if the DB bill moves. |
| 2 | **SFTP is the wrong upload mechanism for your accounts.** §7 and §10 describe the backend buffering uploads and pushing them over SFTP. On Vercel, a shared-hosting SFTP session must complete inside a 10–60s function with 500 MB of `/tmp`, and §10 itself warns "Cloudflare Workers should not be treated like a normal server with an SFTP client." The same applies to Vercel. | Resolved in **§7**: a small **PHP media gateway** script on the shared host. The app signs an HMAC request; the gateway writes files *locally* (no SFTP hop, no timeout ceiling, host-native bandwidth) and serves them over HTTPS. SFTP survives only as a fallback driver and as the way you *administer* the host. |
| 3 | **Legal/ToS blocker on the launch account.** Vercel Hobby is licensed for *personal, non-commercial use only*, defined broadly enough to include work done for any financial gain, and it is enforced by project suspension. A platform that sells vendor subscriptions is unambiguously commercial. Limits also hard-pause projects (100 GB bandwidth, 10s–60s function duration, 100K–1M invocations, 1 concurrent build, 5,000 image transforms, no overage purchase). | Resolved in **§2.3**: build and demo on Hobby, but **before you charge anyone**, move to Vercel Pro ($20/mo) or deploy the same code to Cloudflare (free for commercial use). Chosen so the switch is an env-var change, not a rewrite. **This is a launch gate, not a nicety.** |
| 4 | Minor: §11 is followed by §13 — there is no §12 in the first half. The numbering gap is cosmetic; nothing was lost. | Noted so the traceability matrix in **§23** has 80/80 coverage. |

**What is deliberately *not* in this plan:** Cloudflare Durable Objects, Workers Queues, R2, a Kubernetes/Docker platform, a separate Go/Java service, React Native, and AI features. `plan.md` §13.7, §48 and §61 already deferred these; I am holding that line and it is recorded in §24.

---

## 1. Positioning (locked, from `plan.md` §76, §78)

> **A simple multi-tenant business storefront + catalogue platform that turns buyer interest into a WhatsApp conversation.**

Three consequences that drive every design decision below:

1. **Catalogue-first, not e-commerce-first.** The unit of the product is a *catalogue item* that happens to be a product, course, service, property, or event. There is no cart-to-payment pipeline; there is a *conversion to WhatsApp*. (§76)
2. **The platform never touches the money between vendor and buyer.** Vendor→platform money (subscriptions/add-ons) is the only money we model. (¶64)
3. **The vendor may be technically weak.** "Clarity beats capability" is a hard rule: the onboarding wizard, "Add item," and payment-proof upload are the three highest-polish screens in the product. (§8, §59, §60, §13.5)

### 1.1 Naming hygiene (mandatory, from §7)

Words are load-bearing. `order` implies checkout, inventory and fulfilment, none of which we do.

| Use | Never use |
|---|---|
| `catalogue_item` | `product` (except in copy for retail verticals) |
| `inquiry` / `lead` | `order` (until a vendor *promotes* a lead to an order) |
| `payment_intent` (vendor→platform) | `checkout`, `transaction` |
| `engagement metric` | "sales", "revenue" for vendor GMV — we cannot see it |

Vendor-facing copy is allowed to say "Order via WhatsApp"; the *code and schema* must not.

---

## 2. Stack decision (the answer to "what do you think is best")

### 2.1 Your actual constraints

| Constraint | Consequence |
|---|---|
| Vercel Hobby (no paid plan) | Next.js App Router is a first-class citizen → **free SSR with real `og:` tags**, which §9/§6 say is non-negotiable because WhatsApp's crawler does not execute JS. But: non-commercial licence, hard-pausing limits, 10–60s function ceiling, 1 concurrent build. |
| Shared cPanel hosting with ~100 GB | You have **disk + Apache + PHP + MySQL** and *bandwidth*. This is a media appliance, not an app server. Long-running Node processes are typically disallowed/killed. |
| No VPS | No `ssh2-sftp-client` daemon, no Redis, no worker process, no nginx, no cron beyond the host's cPanel cron (available and useful), no WebSockets. |
| Solo builder | One language, one deployable, boring database, minimal infrastructure to nurse. |

### 2.2 Decision

| Layer | Choice | Why this and not the alternative |
|---|---|---|
| App framework | **Next.js 15 (App Router, RSC + Server Actions)** | SSR is *required* for OG/WhatsApp previews and SEO (§9, §13.4, §44). One deployable covers public site + vendor dashboard + admin panel, so design system and data fetching stay unified. **Rejected:** Vite SPA + separate API (two deployables, more code, no SSR for free); Laravel (fine for you, but §8's dynamic-field JSONB and §43 search are cleaner in Postgres, and a PHP+JS split doubles the language surface). |
| Runtime/deploy | **Vercel** for dev/staging; **Vercel Pro or Cloudflare Workers (`@opennextjs/cloudflare`) for public launch** | Keeps $0 today, makes the launch fix a plan change (Pro) or an adapter swap (OpenNext) — not a rewrite. No framework code may assume Node-only APIs outside an allow-list (see §19.4). |
| Database | **Postgres** — dev: embedded **PGlite** (real Postgres, zero setup); staging/prod: **Neon** free/low tier or **Vercel Postgres** | The whole product rests on JSON-schema-per-catalogue-type + per-item JSON values (§3, §24). Postgres gives `jsonb` + GIN indexes + generated columns for filtering, and `CHECK`/`enum` constraints. **Rejected: Cloudflare D1** — SQLite-flavoured, per-DB size caps, weaker JSON tooling, migrations through a proxy; §48's "D1 definitely" is only right if you also accept Workers as the app host, which §13.7 already refused. Fallback if a DB bill appears: D1 is genuinely fine for read-heavy storefront pages — recorded in §24 R6. |
| ORM/migrations | **Drizzle ORM + drizzle-kit** (SQL migrations in git) | Typed, no runtime magic, same SQL runs on PGlite and Neon. **Rejected:** Prisma (engine binary + heavier cold starts on serverless), raw SQL everywhere (too much duplication for 40+ tables). |
| Validation | **Zod**, one schema per entity, **shared** by form UI and server action | §13.1's "client-side validation is UX only" is enforced structurally: the server action parses with the same schema the form uses, so they cannot drift. |
| Auth | **Home-grown sessions**: `scrypt` (node:crypto) + httpOnly/sameSite=lax cookie + `sessions` table | No native build deps (argon2/bcrypt fail on some serverless targets), works on Vercel *and* Workers, and we need role + tenant claims anyway. **Rejected:** NextAuth/Auth.js (extra weight, OAuth-shaped for a product that is 100% email+password today). |
| Media | **MediaService abstraction** with drivers: `local` (dev), **`gateway` (your shared host, via PHP script)**, `sftp` (fallback), `r2` (future) | Satisfies §11's "the rest of the application doesn't care" and keeps §79's amendment honest. Full protocol in §7. |
| Background jobs | **Postgres-backed `jobs` table + `cron_triggers`** (Vercel Cron on the platform; cPanel cron on the host as backup), run opportunistically | §48's Queues/Cron needs are real (expiry, grace periods, orphan cleanup, analytics rollups) but no broker is affordable on your accounts. At-least-once + idempotent handlers. Design in §17. |
| CSS/UI | **Tailwind v4 + a small in-repo component kit** (`Button/Card/Field/Table/EmptyState/Toast…`) | §13.5 demands "one coherent product, not three apps" across public/dashboard/admin — that is a token + component discipline problem, not a library problem. **Rejected:** MUI (§47's suggestion) — heavy runtime CSS-in-JS, fights the design register §13.5 wants, hurts the TTFB budget on Hobby. |
| Email/notify | Phase 1: **in-app notifications only** (§40). Resend/Postmark later. | §40 explicitly says don't make other channels mandatory in V1. |
| Payments | Phase 2: **Paystack** hosted page + webhook, dual-path with manual proof (§0) | Paystack's webhook + signature verification are simple to do correctly; §13.1's "never trust a client-side 'payment successful'" is a hard rule in §11. |
| Search | Postgres FTS (`tsvector` + GIN) + trigram for names/slugs | §43 needs a search bar and filters; a separate engine (Meilisearch/Algolia) is another thing to host and pay for. Re-evaluate at >50k items (§24 R4). |

### 2.3 The Hobby problem, concretely

Do this in this order; it costs nothing to prepare:

1. **Now (M0–M6):** build on Hobby. It is genuinely fine: SSR pages are cheap, you are alone, and you have no users.
2. **Before inviting a real vendor / before any ₦ changes hands:** upgrade to **Vercel Pro**, *or* deploy the identical code to **Cloudflare** with `@opennextjs/cloudflare` (free Workers tier permits commercial use: 100K requests/day) with Neon/Vercel Postgres for the DB and your shared host for media.
3. **Never** launch on a `*.vercel.app` domain as the public product — Vercel blocks/penalises commercial use on its subdomain, and `business/<slug>` URLs deserve your own domain for the trust story in §3 of `plan.md`.
4. Guardrails baked into the code so a Hobby month cannot hard-pause the site: ≤60s function budget everywhere (`maxDuration = 60`), no image transforms through `next/image` remote optimizer (serve pre-sized variants from the gateway instead of spending 5,000 transforms/month), and `analytics_events` written in **batched** requests (one POST per pageview, never per-impression-per-card) — see §16.3.

---

## 3. Target architecture

```
                          ┌───────────────────────────────────────────┐
  Browser (mobile-first)  │  Next.js 15 on Vercel  (one deployable)   │
  ────────────────────────▶  ┌───────────────┐  ┌───────────────────┐  │
   public storefront        │ App Router RSC │  │ Server Actions    │  │
   vendor /dashboard        │ SSR + <Metadata>│ │ (mutations, auth,  │  │
   admin /admin             │ og:, JSON-LD    │  │  rbac, quota)     │  │
                            └───────┬────────┘  └────────┬──────────┘  │
                                    │                    │             │
                            ┌───────▼────────────────────▼─────────┐   │
                            │  Domain layer: catalogue engine,     │   │
                            │  whatsapp engine, media svc, pricing │   │
                            └───┬───────────────┬──────────────┬───┘   │
                                │               │              │       │
                     ┌──────────▼───┐   ┌───────▼──────┐  ┌────▼──────────────┐
                     │ Postgres     │   │ MediaService │  │ Paystack (P2)     │
                     │ dev: PGlite  │   │  (interface) │  │ hosted page +     │
                     │ prod: Neon   │   └───┬──────┬───┘  │ webhook verify    │
                     │ jsonb+GIN FTS│       │      │      └───────────────────┘
                     └──────────────┘  local│      │gateway (HMAC POST)
                                              ▼      ▼
                                    ┌───────────────────────────┐
                                    │ Shared cPanel host        │
                                    │  /app-storage/vendors/... │──▶ HTTPS
                                    │  gateway.php (PHP 8)     │    media.<domain>
                                    │  cPanel cron → /api/cron  │    (public media)
                                    └───────────────────────────┘    private files: signed URL
```

**Invariants the code must enforce** (each is testable, see §20):

- **I1 — Tenant isolation.** Every read/write touching a tenant-owned row is scoped by a `business_id` derived from the *session*, never from client input. (§50, §66, §13.1)
- **I2 — The browser never decides.** `role`, `price`, `subscription_status`, `vendor_id`, `visibility` are server-derived. (¶66)
- **I3 — Money requires an invariant.** A `payment_intent` only ever changes `pending → verified|rejected`; verification flips subscription + business + audit log **inside one transaction**. (§17)
- **I4 — Nothing public is un-OG'd.** Every public catalogue item and business page renders `og:title/description/image/url` server-side. Without it the core conversion loop (§4, ¶6) silently breaks.
- **I5 — Media is metadata in the DB, bytes on the host.** The DB never stores file content. (§12)
- **I6 — Private media is never a public path.** Payment proofs/verification docs are fetched via a signed, expiring URL through the gateway. (§14)

---

## 4. Repository layout

Monorepo-free: one Next.js app, one `src/`, shared code by path import. A workspace split is deferred until a second consumer exists (public API, mobile).

```
cybershop/
  plan.md                  # product intent (input, unchanged)
  BUILD_PLAN.md            # this file
  docs/decisions/          # one file per ADR (0001-postgres-over-d1.md ...)
  docs/media-gateway/      # deployable PHP gateway + protocol spec
  docs/api.md              # public REST contract (Phase 3)
  docs/runbook.md          # deploy, backup, incident steps
  drizzle/                 # generated SQL migrations (committed)
  scripts/db.ts            # migrate | seed | reset | jobs runner
  scripts/import-catalogue.ts   # CSV import, shared with the UI path
  src/app/(public)         # discover, business/[slug], item pages, sitemap, robots
  src/app/(auth)           # signup, login
  src/app/(onboarding)     # 6-step wizard
  src/app/dashboard        # vendor experience
  src/app/account          # buyer account
  src/app/admin            # admin panel
  src/app/api              # cron, paystack webhook, media upload, analytics ingest, og, REST
  src/db                   # schema.ts, client.ts, tenants.ts (scoped helpers)
  src/core                 # auth|catalog|whatsapp|media|billing|quota|seo|jobs (no next/*)
  src/ui                   # kit/, catalogue-fields/, storefront/, dashboard/, admin/
  src/lib                  # env.ts (validated), slug, money, ids, results, log
  tests/  e2e/
```

**Rules.**
- `src/core/**` imports nothing from `next/*` and nothing from `src/db` directly; it receives a repository interface. That is what makes the domain unit-testable and portable if the API later moves to a Worker. The module list in `plan.md` 71 *is* this directory list.
- Reads happen in RSC queries; **writes happen only in Server Actions**, and every action calls `requirePermission()` + `requireMembership()` first. The authorization audit therefore reduces to "open the action file".
- `src/lib/env.ts` is the only reader of `process.env`: zod-parsed, fails at boot, never in a request.
- CI: `tsc --noEmit`, eslint import-layer boundary rule, `drizzle-kit check`, vitest, playwright smoke.

### 4.1 Decisions recorded as ADRs

| ADR | Decision | Status |
|---|---|---|
| 0001 | Postgres over Cloudflare D1/SQLite | accepted (2.2) |
| 0002 | Media via signed PHP gateway, not SFTP-from-serverless | accepted (7) |
| 0003 | Catalogue types as config (JSONB schemas), not per-vertical tables | accepted (6) |
| 0004 | Soft delete + explicit state machine for lifecycle | accepted (17.3) |
| 0005 | Server Actions now; public REST at Phase 3 | accepted (9) |
| 0006 | **Do not launch commercially on Vercel Hobby** | **blocking** (2.3) |

---

## 5. Data model (full detail in docs/DATA_MODEL.md)

~40 tables in six clusters. Conventions: `id uuid` (v7, sortable), `timestamptz`, money as `bigint` minor units + `currency char(3)` (never float: Naira amounts must not drift), `deleted_at` soft delete with partial uniques, and `business_id NOT NULL` on every tenant-owned row.

| Cluster | Tables | Notes |
|---|---|---|
| Identity/tenancy | `users roles permissions role_permissions user_roles sessions businesses business_members business_locations` | Platform role vs business-scoped role in one `user_roles` with nullable `business_id` |
| Taxonomy + engine | `business_types categories catalogue_types field_definitions field_options item_field_values catalogue_templates` | The whole vertical-swap mechanism; `item_field_values` carries generated `tsvector`/`numeric` projections for search and filters |
| Items | `catalogue_items item_media variants variant_options item_relations offers tags item_tags` | Core fields (name/price/status) on the item; vertical attributes in EAV |
| Media | `media` | lifecycle `uploading/available/attached/unused/deleted/failed`, `quota_charged`, `checksum`, variants JSONB |
| WhatsApp | `whatsapp_numbers whatsapp_routing wa_templates wa_links` | `wa_links.short_code` = the redirect that makes click tracking reliable (9.3) |
| CRM | `inquiries inquiry_items inquiry_events lead_statuses inquiry_status_history` | "Intent", not "order" (plan.md 7) |
| Billing | `plans plan_quotas plan_features addons addon_purchases subscriptions subscription_items usage_records payments platform_settings` | Payment-intent centred, provider-agnostic (plan.md 16) |
| Trust/ops | `reports reviews notifications audit_logs favorites recent_views buyers_profiles` | |
| Analytics | `analytics_events` (monthly partitions, 90d raw) `analytics_daily` (forever) | rollups, never raw for dashboards |
| Platform | `jobs outbox api_keys rate_limits` | the "queue" we can afford |

Three structural notes that are easy to get wrong later:

1. **`field_definitions` is admin-owned, `item_field_values` is item-owned.** Editing a schema never rewrites item rows. Deprecating a field sets `deprecated_at` and hides it; the value survives (plan.md 42).
2. **Filters never scan JSONB blindly.** A discovery filter joins `item_field_values` for one known `field_definition_id` and hits the `value_num`/`value_json`/`value_text` projection, so the planner stays boring.
3. **A `payment` is the only writable money row**, and `payments.status` transitions are guarded by a DB-level trigger plus a service-level transaction that atomically sets subscription + business + audit log (invariant I3).

---

## 6. Dynamic catalogue engine (the key architectural piece)

`plan.md` 3 + 24 + 25 ask for a configuration engine instead of hardcoded verticals. This is the spec.

### 6.1 Layering

```
business_type   "Academy"        -> which catalogue_types are offered, storefront defaults, copy
  catalogue_type "Course"        -> field schema, CTA verb, item noun, SEO schema kind, media rules
    field_definition "Duration"  -> type, required, filterable, searchable, validation, config
      field_option "6 weeks"     -> select options
  catalogue_template             -> a pre-filled field set a vendor can start from
```
A business selects one or more catalogue types (quota-gated: `plan_quotas.categories`). It may then **add custom fields to its own items** only if `plan_features.customFields` allows, and those definitions are scoped `business_id` so a "salon" can add "Stylist" without touching the platform-wide "Service" schema. Admin CRUD covers all four layers with zero deploys (plan.md 3).

### 6.2 Field type registry (single source of truth)

`src/core/catalog/field-types.ts` exports, per type, `{ parse, validate, serialize, isEmpty, renderInput, renderReadonly, renderOgLine, toFilter, textSearchable }`. Everything else — form renderer, API validation, CSV import/export mapping, WhatsApp message composition, SEO schema, admin field builder's "what can this do" panel — is driven by that registry. Adding a type is one entry + 3 tests.

```
text textarea number currency boolean date time datetime
select multiselect radio checkbox url email phone
image video file location richtext duration rating dims  (dims = LxWxH, location = geo+label)
```
Field-level `validation` JSONB: `{ min, max, pattern, enum, maxLength, allowedMime[], maxBytes, integer, positive, before, after }`. `config` JSONB: `{ unit, decimals, optionsSource, multiple, rows, geoAccuracy }`. Rules:
- **Prices are `currency`**, stored on `catalogue_items.price` when the field key is `price` (so sorting works) and in EAV otherwise; `price_type` covers "from N" / "on request" / "free" without new columns per vertical.
- **`file/image/video` fields store `media_id`s**, validated against `config.allowedMime` *and* sniffed signature server-side (plan.md 13), with per-type byte caps from `plan_quotas`.
- **Nothing renders unvalidated:** `richtext` is sanitised to an allow-list on write and stored as HTML + plain text; the plain text feeds the OG description and the FTS index.
- **Unknown key in a payload = rejection, not ignore.** A client cannot smuggle `is_featured` or `price` through the EAV bag.

### 6.3 Versioning and safety

`catalogue_types.schema_version` increments when a definition is added/retyped; items keep `template_id` and show a subtle "this listing uses an older template" admin hint rather than being force-migrated. Retyping a field (number -> select) requires an admin mapping step or is blocked; the migration generator emits a `field_value_casts` job so it is never silently destructive. This is the one place where config-as-data needs a governance rule, because a bad edit would otherwise break every vendor in that vertical at once.

### 6.4 Quotas metered off the engine

`usage_records` counts items, media bytes, numbers, staff seats, custom fields, featured slots, locations, API calls (plan.md 19). Enforcement is in the action, checked *before* write, and re-checked on a schedule because admin can change plans retroactively. Soft limit at 80% warns in-dashboard; hard limit blocks the write with an upgrade CTA that names the exact add-on price.

---

## 7. Media service and the shared-host gateway

### 7.1 Interface (plan.md 11)

```ts
interface MediaService {
  createUploadTicket(req: UploadRequest): Promise<Ticket>   // signed, single-use, expiring
  commit(ticketId, meta): Promise<MediaRecord>              // gateway -> app: "bytes are here"
  delete(storageKey): Promise<void>
  replace(oldKey, req): Promise<MediaRecord>
  getUrl(media, { variant, ttlSeconds }): Promise<string>   // public path, or signed for private
  exists(storageKey): Promise<boolean>
  usage(businessId): Promise<{ bytes: number; count: number }>
}
```
Drivers: `local` (dev, `.data/media`), `gateway` (production), `sftp` (fallback where PHP is unavailable), `r2` (future). Chosen by `MEDIA_DRIVER`; the app never imports a driver directly.

### 7.2 Upload flow (no SFTP from serverless, no giant function timeouts)

```
1 vendor picks file (dashboard) -> browser compresses/resizes to tier caps via canvas (mobile-first:
  5MB phone photo becomes ~250KB webp before it ever leaves the device)
2 POST /api/media/ticket  (server: authn, authz, quota, mime/size/extension allow-list,
  randomize key, returns {ticket, hmac, endpoint, expiresAt})
3 browser PUT/POST file directly to gateway.php on the shared host, carrying the ticket
4 gateway re-validates (finfo MIME, real size, image dims, EXIF strip, extension<->signature,
  path confinement to the vendor's subtree), writes variants (thumb/lg/og), writes a sidecar
  .json manifest, returns {storageKey, url, bytes, width, height, checksum, variants}
5 app verifies response signature + checksum, inserts `media` row with status 'available'
   (dedupe by checksum to save the 100GB)
6 on item save: media.status -> 'attached', quota_charged = true
   if step 5 never happens -> 'unused' -> grace period -> cleanup job (plan.md 58)
```
Direct-to-gateway is deliberate: the file body never traverses the Vercel function, so Hobby's duration/`/tmp`/bandwidth limits are irrelevant to upload size. Only metadata does.

### 7.3 Gateway layout, on the host (plan.md 12, 14)

```
/domains/media.<yourdomain>/          <- docroot, Apache serves static files, no PHP execution here
   vendors/{business_id}/{profile|branding|catalogue/{type}/{item_id}}/{uuid}-{kind}.{ext}
   platform/{branding|exports}
/private-storage/  (outside docroot)  <- payment proofs, KYC, exports
   vendors/{business_id}/private/payment-proofs/...
```
- Public files: served by Apache with correct `Content-Type`, `Cache-Control: public, max-age=31536000, immutable`, CORS `*` for `GET` only, no directory listing, `X-Content-Type-Options: nosniff`. This is what makes WhatsApp's link preview card work (plan.md 4).
- Private files: **no public path**. `GET gateway.php?op=fetch&key=..&exp=..&sig=..` streams after signature check; the app mints 5-minute URLs for admin proof review only.
- Filenames are generated UUIDs; the original name is DB metadata for download only. Path traversal is impossible by construction: the gateway resolves keys against a fixed root and rejects anything containing `..` or leaving the vendor's subtree.
- `docs/media-gateway/gateway.php` is committed, dependency-free PHP 8 (no composer), ~300 lines, and its protocol is specced in `docs/media-gateway/README.md`. Shared-host hardening: per-ticket single use, IP-agnostic HMAC (host IPs change), request body cap via `post_max_size`, a `.htaccess` denying access to manifests, and a `gateway.php?op=ping` health endpoint.
- **Backup rule** (plan.md 56): a nightly cPanel job rsyncs `platform/` + a rotating copy of `vendors/` to a second location. `plan.md` 7's warning stands — one host is a single point of failure for irreplaceable business files.

### 7.4 Quotas (plan.md 57)

`plan_quotas.media_bytes` per business, counted from `media.byte_size WHERE quota_charged`. UI meter with 80/90/100 states; upload ticket refused at 100% with an "add 10GB for N/mo" CTA. Admin sees total used/available, largest vendors, orphans, failed uploads, and can grant a one-off override (logged in `audit_logs`). Video is gated by plan (`plan_features.video`) and capped at 25MB / 60s in phase 1 — 100 GB evaporates quickly otherwise (plan.md 7).

---

## 8. WhatsApp engine (the conversion product)

### 8.1 What we do and do not claim

`wa.me` deep-linking only (plan.md 0, 4, 5): no WhatsApp Business API, no Meta approval, zero cost, and **no ability to attach an image to the outgoing message**. So the preview card comes from the *product URL*'s Open Graph tags, and the message carries a link (plan.md 6). The system must never promise "the image will be attached".

```
item -> public URL -> og:title/description/image/url -> wa.me link -> prefilled text
```

### 8.2 Link construction (pure, unit-tested to exhaustion)

```ts
buildWaLink({ numberE164, template, context }): { url: string; text: string }
  -> e164 normalize (accept 0803… , +234…, 234…, spaces/dashes) -> reject non-NG/invalid unless admin allows
  -> render template with variables -> collapse empty lines -> clamp to 900 chars (WhatsApp safe limit)
  -> encodeURIComponent (NOT encodeURI: & = ? # must escape or the message breaks)
  -> https://wa.me/{e164}?text={encoded}
```
Variables available to templates (plan.md 62): `{{business_name}} {{item_name}} {{price}} {{price_line}} {{quantity}} {{variant}} {{sku}} {{item_url}} {{image_url}} {{customer_name}} {{vendor_name}} {{today}} {{offer_line}} {{field:KEY}}` (any custom field), plus `{{cart_lines}}` for multi-item messages. Fallback chain: item template -> category -> catalogue_type -> business -> platform default -> hardcoded English. A template referencing an unknown variable surfaces in the admin editor at save time, and renders as empty (never as literal `{{typo}}` in front of a buyer).

`{{field:KEY}}` is what makes the vertical system pay off in the message: the academy's "Start date", the estate agent's "Bedrooms", the fashion vendor's "Size" all flow into the enquiry with no code.

### 8.3 Click path and attribution

The button is **not** an `<a href="https://wa.me/…">`. It is `href="/w/{shortCode}"` served by a redirect handler that: records `inquiries` + `analytics_events(cta_click)`, resolves routing, then `302`s to the deep link. Why: (a) we cannot observe a click on an external link; (b) `plan.md` 32 asks for click analytics; (c) if a vendor's number changes, old shared links still work; (d) the lead row is created server-side, so it cannot be skipped. `wa_links` rows expire (default 30d) to bound table growth. Device detection: on iOS/Android the `wa.me` link opens the app; the page offers "Open WhatsApp Web" as a secondary action (plan.md 63's "WhatsApp number selected" event).

`Lead` is created with `status='new'` and the *composed message snapshot*, so a vendor can see exactly what the buyer was sent even if the buyer edited it away.

### 8.4 Routing (plan.md 4, 63)

Resolution order per click: `item.whatsapp_number_id` -> `whatsapp_routing` rule matching item's category -> matching catalogue type -> offer -> business default -> owner fallback. Rules are `priority`-ordered and editable in dashboard. If a plan drops from 5 numbers to 2, the extra numbers are **disabled, not deleted** (`is_active=false`), and clicks fall back to the default with an admin-facing warning — vendors must never silently lose a routing target, and never keep a paid-for privilege they stopped paying for.

### 8.5 Cart -> one message (plan.md 30)

Session-scoped "enquiry basket" (localStorage + optional DB `inquiry_items`), no inventory claims, no price promises: the composed message lists `1. HP Laptop x1`, `2. Wireless Mouse x2`, `Estimated total: N450,000` and the line "please confirm availability and final price". Stock is never decremented (the sale is off-platform), so the UI says "in stock" only when the vendor marked it so.

---

## 9. API surface

### 9.1 Two surfaces, one core

| Surface | Use | Notes |
|---|---|---|
| **Server Actions** (all mutations, M0-M12) | forms, buttons | typed, colocated, no hand-written endpoints; return `Result<T>` (`{ok:true,data} | {ok:false,code,fields}`) so forms render field errors instead of toasts-of-death |
| **Route handlers** (read APIs, webhooks, ingest) | `GET /api/public/…`, `POST /api/paystack/webhook`, `POST /api/analytics`, `POST /api/cron`, `GET /w/:code`, `GET /og/:item` | only these are HTTP-shaped; versioned under `/api/v1` when public |
| **Public REST** (Phase 3, docs/api.md) | mobile app (plan.md 74), vendor API keys (19) | same core, `api_keys` scopes, cursor pagination, rate limits per key |

### 9.2 Contracts that must be stable early

```
GET /api/v1/businesses?category=&q=&city=&featured=&cursor=&limit=   -> {items[],next}
GET /api/v1/businesses/:slug                                        -> profile + sections
GET /api/v1/businesses/:slug/items?type=&cursor=&filters[…]         -> items + resolved field defs
GET /api/v1/items/:id                                               -> item + schema + variants + offers + wa link
POST /api/v1/whatsapp/resolve  {item_id, qty, variant_id, cart[]}    -> {url, message, lead_id}
```
`filters[…]` keys are `field_definition.key`s; the server maps them to `item_field_values` projections. This shape is the reason the EAV stays queryable, so it is written into `docs/api.md` at M2 even though the mobile app is Phase 3.

### 9.3 Idempotency and concurrency (plan.md 13.2)

- Every mutation form carries a client `idempotency_key`; `payments.idempotency_key` and `jobs.dedupe_key` are unique, so a double-click inserts once, and the second call returns the first result.
- Uploads: ticket is single-use, `commit` is idempotent by `(ticketId)`.
- Paystack webhook: `external_ref` unique + handler is a no-op if already `verified`; a duplicate delivery cannot extend a subscription twice.
- Optimistic locking on catalogue items (`updated_at` token in the form) so two staff members editing one item do not silently overwrite; conflict returns a "someone else saved while you were typing" state, not a 500.
- Admin bulk actions run in one transaction per row with a per-row result list rendered back (partial success must be legible).

---

## 10. AuthN, AuthZ, and security

### 10.1 Session and cookie

`session_id` (256-bit) -> DB row with `token_hash` (sha256); the raw id never persists. Cookie: `httpOnly; sameSite=lax; secure` + `Path=/`; absolute expiry 30d with rolling refresh on authenticated request; revoked on password change / admin suspend / logout-all. Passwords: `scrypt(N=2^15,r=8,p=1)` with per-user salt, stored as `scrypt$N$r$p$salt$hash`; rehash-on-login when params change; 12-char max handled, NFKC-normalised. Rate limiting on login/signup/reset/proof-upload/CTA-redirect per IP+identifier (DB bucket table), with exponential backoff and `failed_attempts`/`locked_until` lockout (plan.md 13.1). Admin panel gets an extra gate: separate `ADMIN_COOKIE` path + optional TOTP later.

CSRF: Server Actions are same-origin POST + Next's built-in token; `sameSite=lax` + Origin check on every mutating route handler covers the rest. Public write endpoints (`/api/analytics`, `/w/:code`) are read-mostly and rate-limited, and never mutate billing state.

### 10.2 RBAC model

`permissions` are dotted strings; roles map to them; a user has platform roles (admin staff: `super_admin, finance_admin, content_admin, support_admin, moderator, analyst` per plan.md 34) and/or per-business roles (`owner, manager, sales, catalogue_manager, support, accountant` per plan.md 51). Enforcement helper:

```ts
requireUser()                      // -> session or throw redirect
requirePermission('payments.verify')       // platform scope
requireMembership(businessId,'catalogue.edit')  // tenant scope: membership + permission together
```
Every action calls the tenant-scoped one. `permissions.catalogue.moderate` (admin) is the only way to edit another tenant's row, and always writes an audit log with before/after.

### 10.3 Threat checklist (what gets tested, 20)

| Threat | Control |
|---|---|
| IDOR: vendor A edits vendor B's item | `requireMembership` on 100% of writes; authz-matrix test asserts every action rejects a foreign tenant with 403 |
| Privilege escalation via role guess | roles never read from payload; only from session; admin routes guarded by separate guard |
| Payment spoofing | Paystack only via verified webhook signature; manual proofs are claims until an admin approves (plan.md 13.1); no auto-activation from an upload |
| Upload abuse | MIME sniff, size caps per tier, extension allow-list, randomized key, EXIF strip, no PHP/executable, private/public separation, per-user upload rate limit, `nosniff` |
| XSS via richtext/custom fields/OG text | allow-list sanitiser on write, escape on read, no `dangerouslySetInnerHTML` outside the sanitiser's output, CSP (`default-src 'self'`, `img-src 'self' media.<domain> https:`, `frame-ancestors 'none'`) |
| SQL injection | Drizzle parameterised only; raw SQL allowed only in `db/` with lint exception + test |
| Slug/URL manipulation | slugs validated `^[a-z0-9-]{2,64}$`, uniqueness per business, reserved words blocked (`admin`, `api`, `dashboard`, `account`…) |
| Enum/tenant drift | DB checks + generated column constraints; `assert` guards in dev |
| Secrets in logs | redaction list in `lib/log.ts`; logger refuses known secret keys |
| Abuse content (plan.md 65) | report flow -> moderation queue, image removal keeps a tombstone, suspension hides storefront with "temporarily unavailable" (plan.md 41) not 404 |
| Bulk scraping | robots.txt + soft rate limit on list endpoints; no private data in public payloads; `visibility=unlisted` items excluded from sitemap |
| Multi-account on one IP for free-plan farming | signup throttle + device fingerprinting deferred to Phase 2 with referral/verification data (plan.md 65) |

### 10.4 PII and Nigerian realities

Buyers are optional accounts (plan.md 20); we should therefore collect the minimum. Phone numbers and WhatsApp numbers are personal data: encrypted at rest with an app-level key for `whatsapp_numbers.e164` (cheap: `node:crypto` AES-GCM) + HMAC index column for equality lookups. Data lifecycle per plan.md 42: account deletion -> soft delete -> 30-day recovery -> anonymise lead contact details, keep aggregate counts. Retention: raw analytics 90d, `inquiries` kept for the business (it is their CRM record — deleting the platform's copy destroys their data, so deletion is theirs to trigger).

---

## 11. Billing, plans, and the payment queue (Phase 2, stubbed in Phase 1)

`plan.md` 0, 5, 15-19, 41. You asked for the storefront first, so Phase 1 ships `billing` as **inert data**: a default free `plan` row, quota enforcement active, no payment UI, and the activation gate turned off (vendors go straight to `active`). The `payments` table and its status machine exist from M1 so Phase 2 is additive, not a migration.

### 11.1 Payment intent, not provider coupling (plan.md 16)

```
kind ∈ {activation, subscription, addon}  ×  method ∈ {bank_transfer, paystack, manual, free}
status: pending -> verified | rejected(failure) -> refunded
```
`free` exists so trial/self-granted plans flow through the same code (and audit) as paid ones — otherwise "admin gave a vendor 3 months" lives in some column nobody audits. Adding Flutterwave/Moniepoint later is a new `method` + webhook handler, no schema change.

### 11.2 Two paths, one queue (plan.md 5, 16, 17)

```
Bank transfer: vendor sees account details + reference (CS-{bizShort}-{seq}) -> uploads proof
  -> payment(pending) -> admin queue -> Approve (tx: payment verified, subscription active,
  business active, audit log, notification, usage quota refresh) | Reject (reason required,
  vendor notified, item remains viewable/retryable)
Paystack: initializeTransaction(email, amount, reference) -> redirect -> webhook
  verifySignature(event) -> getTransaction(id) -> compare amount+currency+reference (server-side
  recompute, never trust the payload's amount) -> mark verified (same tx as above)
  Auto-activation, no human. Idempotent on external_ref.
```
Reference format is machine-parseable so a human reconciling a bank statement can find the row. Amounts are recomputed from `plan_price × interval × addon deltas` server-side; a client-sent amount is ignored (I2).

### 11.3 Plan/add-on semantics (plan.md 0)

Base tiers cover defaults; **everything beyond a tier is a separately priced add-on** (`addons.kind`), purchased and expiring on its own clock. A subscription and an add-on are independent: buying "extra 10GB" does not extend a plan, and letting a plan lapse disables add-ons the vendor is still paying for only if the business is suspended entirely — recorded decision: **add-ons survive a plan downgrade** (they are prepaid capacity), which is the vendor-friendly reading of "priced and toggled by admin, independent of the base tier".

Overdue/expiry: `active -> expiring(7,3,1d notices) -> expired -> grace(N days, admin-configurable) -> suspended`. Suspension **never deletes**: public storefront becomes a soft "temporarily unavailable" page, `noindex` applied, items hidden from discovery, leads preserved and still viewable after renewal (plan.md 41). Scheduled notices run from `jobs`, not from a resident process.

---

## 12. Vendor experience (the product's real moat is simplicity)

Information architecture (plan.md 46, 8):

```
/dashboard                 overview        today's numbers, quick actions, storage meter, plan state,
                                           "finish setup" progress if onboarding incomplete
/dashboard/catalogue       list, tabs All/Active/Draft/Out of stock/Archived, search, filter,
                                           sort, bulk row actions, duplicate, publish toggle (plan.md 9)
/dashboard/catalogue/new   2-step "easy first" composer: name/price/photo/WhatsApp number
                                           (+ More options reveals SKU, category, variants, stock,
                                           tags, SEO, custom fields) (plan.md 60)
/dashboard/catalogue/[id]/edit
/dashboard/offers          (P2) discounts, bundles, limited-time (plan.md 28)
/dashboard/whatsapp        numbers CRUD + labels + default + routing rules + template editor with
                                           live preview of the exact message (plan.md 4, 62, 63)
/dashboard/media           grid, per-folder, quota meter, upload, replace, delete (unused-first hints)
/dashboard/leads             CRM board: New/Contacted/Interested/Negotiating/Converted/Lost,
                                           note, convert-to-order placeholder, source per lead (plan.md 31)
/dashboard/analytics       today/7/30/90/custom, item performance, CTA conversion, traffic/device
                                           (plan.md 32, 33) - labelled "engagement, not sales"
/dashboard/storefront      style preset, section toggles, reorder, preview-drawer (plan.md 26, 27)
/dashboard/subscription    plan, usage bars, add-ons marketplace, invoices, payment history (P2)
/dashboard/settings        profile, categories, locations, hours, socials, policies, FAQs,
                                           buyer-facing contact prefs, visibility toggle, delete/export
/dashboard/share           copy link, QR (store + per item), WhatsApp/Facebook/X/Telegram/Email (plan.md 53, 54)
```
Design rules for every one of these: primary verb is a big green WhatsApp button; nothing is destructive without a named consequence ("2 images will be deleted from storage"); every list has an empty state that is an *action* ("Add your first item") not a shrug; every form autosaves to draft after 1.5s idle because this audience loses forms; error copy says what to do next in one sentence. Phone-first: the whole dashboard must be usable one-handed on a 360px screen, because vendors update stock from a shop floor.

### 12.1 Onboarding wizard (plan.md 59)

```
1 business name + city + logo     2 what do you offer? (catalogue types)
3 add WhatsApp number             4 add your first item (pre-filled template from type)
5 pick storefront style           6 publish  -> "Your storefront is live: /business/<slug>"
```
Steps are individually saveable and resumable (`businesses.onboarding_step`); publishing requires only 1-4. Billing is inserted after step 4 when Phase 2 turns the gate on (plan.md 15's order: create account -> business -> type -> WhatsApp -> plan -> payment -> verification -> active). Demo/data seed makes step 4 zero-friction (3 taps from a photo).

### 12.2 Buyer experience (plan.md 20, 21)

Guest-only by default. `/account` for optional accounts: favorites, saved businesses, recently viewed, own enquiry history, notification list, profile, "delete my account". No buyer registration wall on any conversion path — the CTA must never ask for a login (explicit rule, tested in e2e).

---

## 13. Admin panel

```
/admin                    KPIs: vendors (total/active/pending/expired), businesses approved today,
                          items, CTA clicks, platform revenue, storage used/100GB + warning at 85%,
                          queue backlog + failed jobs (plan.md 35)
/admin/pending            unified queue: vendor approvals, payment proofs, reports, media flags,
                          storage issues. Every row shows before/after context and one-click action.
/admin/vendors          list + detail: suspend/activate/verify/extend plan/override plan/grant
                          add-on/adjust quota/impersonate (audited, time-boxed, banner-on)
/admin/catalogue        cross-tenant search, unpublish/delete with reason, "why was this hidden"
                          visible to the vendor
/admin/categories       category tree + business_types CRUD
/admin/catalogue-types  the engine UI: types, field definitions builder (drag order, required,
                          filterable/searchable toggles, validation), templates, schema_version bump
/admin/plans            plans, quotas, features, add-ons CRUD (prices, intervals, active)
/admin/payments         both paths, filter by status/method/plan, approve/reject, refund marker,
                          reconciliation view (reference <-> bank statement)
/admin/subscriptions    lifecycle table, force expire/renew, grace config
/admin/users /buyers    search, suspend, merge, export-delete requests
/admin/reports          moderation queue with SLA timer
/admin/media            storage health, orphans, failed uploads, "reclaim X GB" bulk action
/admin/cms              homepage banners, featured stores, WA message templates (platform scope),
                          terms/FAQ/privacy, onboarding copy, email templates
/admin/settings         platform_settings as a typed form (grace days, upload caps, allowed mime,
                          plan gates, feature flags, maintenance mode)
/admin/analytics        platform trends, top categories, conversion, revenue
/admin/audit            filter actor/action/resource; export CSV
```
Granular permissions (plan.md 34) mean a `finance_admin` sees `/admin/payments` and nothing else; nav is generated from the permission set, and the guard re-checks per route. Impersonation requires an explicit permission, writes `audit_logs` on entry *and* exit, shows a persistent banner, and cannot reach `/admin` while active.

---

## 14. Public experience

```
/                     search-first discovery + business_type tiles + featured stores + latest items
                            (plan.md 22, 68)
/discover             faceted search: category, location, price range, business type, catalogue
                            type, availability, offers-on (plan.md 43) - rating filter only once reviews ship
/business/[slug]       storefront: hero, about, section blocks from vendor config, item grid by
                            type, gallery, contact/WhatsApp, offers, map/hours, share/QR
/business/[slug]/[itemSlug]   item page: gallery, price + offer strike, variants, specs from custom
                            fields, big WhatsApp CTA (sticky on mobile), share, related items,
                            FAQ if configured, breadcrumbs
/p/[id]                short canonical link for sharing (redirects, keeps sitemap clean)
/w/[code]              WhatsApp click redirect + tracking
/search?q=             cross-entity results (items, businesses)
```
Storefront styles are 4-6 preset themes (`classic, modern, editorial, minimal, bold, professional`) implemented as layout variants + token overrides, not a drag-builder free-for-all (plan.md 26). A free section toggler (plan.md 27) delivers "an academy looks different from a fashion store" at 10% of a page-builder's cost. True page builders are explicitly Phase 3+.

---

## 15. SEO, OG and structured data

- **URLs:** `/business/{slug}` and `/business/{slug}/{item-slug}`; canonical always that path even when a custom domain (P3) serves it. No `?id=` pages (plan.md 13.4). Item `slug` unique per business, editable with 301 from the old slug (kept in `item_slugs` history table).
- **Metadata:** `generateMetadata()` per business/item from DB rows — unique title, description, canonical, `og:type=website|article` appropriately, `og:image` = the item's `og` variant URL (1200x630, absolute HTTPS), `og:url`, `twitter:card=summary_large_image`. **Server-rendered, in the initial HTML**, because WhatsApp's crawler does not run JS (plan.md 9, 6).
- **Structured data (plan.md 45):** emitted by catalogue type — `Product` (+`Offer` with `availability`, `price`, `priceCurrency`), `Course`, `Service`, `Event`, `Residence/RealEstateListing`, `LocalBusiness`/`Organization` on storefronts. Driven by the same field registry so a "Bedrooms" field can map to a schema property. **No fabricated aggregateRating** (plan.md 43, 13.4).
- **Sitemaps:** `/sitemap.xml` index -> businesses (active+public only), items (published), categories. `robots.txt` disallows `/dashboard`, `/admin`, `/account`, `/api`, `/w/`. Pending/suspended/expired/unlisted stores get `noindex,nofollow` (plan.md 13.4) and are excluded from sitemaps *and* discovery listings, but keep working URLs for the vendor's own preview link.
- **Performance = SEO:** SSR HTML cached (`revalidate`), images pre-sized by the gateway, no render-blocking font (system stack + one variable font, `swap`), self-hosted assets (no Google Fonts on a Hobby budget).
- WhatsApp-specific nicety: OG image must be a **direct file URL** (no redirect, no auth, correct content-type) — this is why the gateway serves static files rather than proxying through the app.

---

## 16. Analytics, leads, and honest metrics

Event kinds (plan.md 32): `page_view`, `item_view`, `item_impression` (batched), `cta_click`, `number_selected`, `cart_add`, `cart_cta`, `share_click`, `qr_scan`, `search`. Identity: anonymous `visitor_id` in localStorage + `session_key` hash (no cookies for tracking -> no consent banner needed for first-party-only counts), optional `buyer_user_id` when logged in.

```
impressions -> views -> CTA clicks -> clicks that opened a client (best effort) -> leads recorded
                                                            ^ conversion to WhatsApp = clicks/views
```
**We do not measure whether a sale happened.** Vendors can mark a lead `converted` and that is the only "sale" number shown, always labelled vendor-reported (plan.md 32, 33). Metrics: per item, per day, per business, per category; platform-wide in admin. Rollups land in `analytics_daily` (job, hourly-ish via cron) and dashboards read only rollups — a vendor with 10k views must not trigger a raw table scan.

Privacy: no third-party pixels in phase 1; if added, behind a vendor-level toggle. Raw events retained 90 days, rollups indefinitely, deleted with the business.

---

## 17. Lifecycle, jobs, notifications

### 17.1 Notifications (plan.md 40)
`notifications` rows, in-app only in phase 1: payment approved/rejected, business approved/rejected/suspended, subscription expiring/expired/grace, storage 80/90/100, item unpublished by moderation, new lead digest (daily, not per-lead, to avoid noise). Bell in dashboard + admin. Email/SMS/push are `outbox` topics with drivers added when a provider is chosen; nothing in the product *requires* them.

### 17.2 Jobs table (plan.md 48's Cron list)
Kinds: `subscription_expiry_sweep`, `grace_enforcement`, `expiry_notices`, `media_orphan_cleanup`, `analytics_rollup`, `usage_recount`, `payment_intent_expiry`, `sitemap_rebuild`, `backup_verify`, `storage_report`, `lead_digest`. Semantics: `queued -> running -> done|failed(attempts++)`, exponential backoff, `dedupe_key` unique, `max_concurrency=1` per kind, handler idempotency asserted in tests. Triggers: `POST /api/cron?kind=…` (authorized by `CRON_SECRET`) called by Vercel Cron — Hobby allows limited schedules (daily at minimum), so the *schedule* is advisory and every sweep is "process everything overdue", which makes daily cron correct-but-late rather than broken. cPanel's own cron can call the same endpoint for hosts where that's more reliable. No job may depend on wall-clock accuracy for money correctness: expiry is computed from `current_period_end <= now()` at read time as well as by sweep.

### 17.3 Data lifecycle (plan.md 42)
`draft -> published -> unpublished -> archived -> (30d) -> soft deleted -> (90d) -> purged`. Media follows `available -> attached -> unused -> grace -> cleanup`. Business suspension hides, never deletes. Vendor-initiated export (CSV + media manifest + JSON) must run before purge, and purge is a documented, dated job. Deletion of a business enqueues `media_purge_business` which removes files, `media` rows, then anonymises leads (their CRM export is offered first — a vendor's customer list is their data, and deleting it silently is the kind of thing that destroys trust).

---

## 18. Design system

**Two registers, one system** (plan.md 67, 68, 13.5): public = *polished + dynamic* (confident, image-led, a bit immersive); dashboard/admin = *calm, dense, high-contrast*. Shared tokens keep it one product.

```
tokens  color: brand(ink/green-wa/surface/ring/danger/warn/ok), semantic only in components
        radius 10/14/20, shadow 3 levels, spacing 4pt scale, fluid type 14-40 via clamp
        focus ring: 2px offset, always visible (a11y rule, plan.md 70)
kit     Button(primary|secondary|ghost|danger|whatsapp) Input Select Textarea Checkbox Radio
        Switch Combobox DateField FileDrop Card Table Pagination Tabs Drawer Dialog Toast
        EmptyState Skeleton ErrorView PermissionState ConfirmDialog Meter Stepper Avatar Badge
public  StorefrontShell ItemCard BusinessCard HeroSection SectionBlock Gallery FilterBar
        SearchBox ShareMenu QRCard OfferRibbon VariantPicker
dash    PageHeader StatTile QuickAction ItemRow LeadCard FieldRenderer*(driven by registry)
admin   DataTable(with bulk) ReviewCard AuditTimeline SchemaBuilder
```
- **Green is reserved.** The WhatsApp action uses the WA green and no other action may; that is what "almost impossible to miss" (plan.md 69) means in a token system.
- Motion: 120-180ms ease-out micro-interactions, `prefers-reduced-motion` respected, no parallax/scroll-jacking (plan.md 13.5, 68).
- A11y: semantic landmarks, labelled form controls bound by `htmlFor`, keyboard nav in all menus/tables, `aria-live` for toasts and validation, alt text from item fields with a required-per-image option, contrast AA (4.5:1) verified in CI with an axe run on 6 representative pages.
- Every async surface implements all 6 states (loading/empty/success/validation/network/server) — this is a checklist item per PR, since plan.md 13.3 calls it out for exactly this audience.
- Dark mode is a Phase 3 nicety, not a v1 blocker; tokens make it additive.

### 18.1 Job runtime contract (carries the broker-free design)

`claim = UPDATE jobs SET status='running', attempts=attempts+1 WHERE id IN (SELECT id FROM jobs
WHERE status='queued' AND run_at<=now() AND kind=$1 ORDER BY run_at LIMIT 200 FOR UPDATE SKIP LOCKED)
RETURNING *` — so two overlapping cron triggers never process the same row twice. Each handler:
idempotent, batched (200), and **time-boxed to 55s** (Vercel function ceiling) with the remainder left
`queued` for the next tick; failures record `last_error` + `run_at = now() + backoff(attempts)`;
after 8 attempts the job is `failed` and surfaces on `/admin/pending` rather than vanishing. A
`job_runs` audit row (kind, count, ms, error) makes "did expiry actually run?" answerable.

---

## 19. Performance budget and platform-specific limits

| Budget | Target | Mechanism |
|---|---|---|
| Public item page TTFB | < 250 ms cached, < 600 ms cold | RSC + `unstable_cache`/`revalidateTag('business:{id}')`, no auth query on public pages |
| Public page JS | < 90 KB gz | server components by default; islands only for gallery/variant picker/cart/clipboard |
| LCP image | < 180 KB | gateway emits `thumb/lg/og` variants; explicit width/height |
| Dashboard interaction | < 200 ms to optimistic feedback | Server Actions + `useOptimistic`, no client fetch layer |
| Function duration | < 55 s | batched jobs, no media bodies in functions (7.2) |
| Invocations | minimize | static-ish public pages via ISR; one analytics beacon per pageview, not per card; no `/api` polling |
| Bandwidth (100 GB) | media never proxied through the app | browser hits `media.<domain>` directly; Vercel serves HTML + small JS |
| DB | p95 < 50 ms reads | covering indexes per §5, rollups for analytics, connection pooler on Neon, PGlite only in dev |
| Image transforms (5k/mo Hobby) | 0 | resize at the gateway, not through `next/image` remote optimization |

**Hard platform rules encoded in the plan:** media bodies bypass Vercel entirely; no function may fan out over N uploads; jobs are 55s-capped; caching is tag-based so a vendor saving one item invalidates their storefront and item page only (`revalidateTag`), not the site.

---

## 20. Testing (right-sized, per plan.md 13.6 — test what loses money or trust)

| Layer | What | Why first |
|---|---|---|
| Unit (`vitest`, `src/core`) | `buildWaLink` encoding matrix (accents, `&`, `#`, emoji, newlines, 900-char clamp, every NG number format), template variable fallback, e164 normalizer, field-registry validators (each type x required/bounds/mime/size), money parsing, quota math, slug rules, plan downgrade number-disabling | the deep link *is* the product; a broken `&` in the message is a lost sale nobody sees |
| Authorization matrix (auto-generated) | for every Server Action × role {anonymous, buyer, vendor-owner, vendor-staff-no-perm, other-vendor, finance_admin, moderator, super_admin} assert allow/deny | turns the IDOR checklist into a test that cannot rot; catches "action forgot `requireMembership`" |
| Data-layer integration | migrate+seed on PGlite, tenant-scoped helpers reject unscoped writes, EAV filter queries return right rows, soft-delete/partials, checksum dedupe | the engine's correctness is invisible until it is wrong |
| Flow e2e (`playwright`) | signup -> wizard -> add item with 3 custom fields -> upload image -> publish -> open public page -> assert `og:image`/`og:url` in HTML -> click CTA -> assert `wa.me/234…?text=` contains name, price, variant, product URL -> admin approves payment -> re-check | plan.md 13.6's list, end-to-end, one test |
| Invariants | I1-I6 asserted as executable checks (e.g. a test that walks every public page's `generateMetadata`, a test that deleting an item schedules media cleanup) | keeps the doc honest as code grows |
| a11y | axe on 6 representative pages + keyboard smoke of the item editor | plan.md 70, 13.5 |
| Load | `k6`/`autocannon` against a preview deploy: 200 rps storefront, filter queries, cron sweep | Hobby pausing means a traffic spike is an outage, not a bill |
| CI | typecheck, lint-boundaries, unit, authz matrix, `drizzle-kit check`, e2e on PR; Vercel preview per PR | solo builds skip tests that are slow to run |

Interim harness: until vitest is wired at M2, `npm run verify` runs the pure-function suites in `tests/verify.ts` with zero dependencies (no DB, no browser). It is what caught the six bugs listed in 27.

Explicitly *not* tested for now: pixel-perfect visual snapshots (change too fast), full coverage targets (a coverage number here is noise), contract tests for the Paystack API beyond webhook verification (mock the event; verify signature; recompute amount).

---

## 21. Observability, errors, and operations

- **Logging:** JSON lines `{ts, level, msg, ctx}`; `requestId` propagated from middleware to every log + response header `x-request-id`; `user_id`, `business_id` attached when known; secrets redacted by key allow-list in `lib/log.ts`. No PII in logs beyond ids.
- **Errors:** every Server Action returns a typed `Result`; unknown errors log with `requestId` and show the user "Something went wrong (id: abc123) - try again" — a code they can paste into support. `error.tsx` + `global-error.tsx` per segment; 404/410 for missing public pages (not error screens).
- **Alerts (cheap):** Vercel error monitoring + one email digest from a daily cron that reports failed jobs, failed webhook deliveries, media commit failures, and storage > 85%. That is enough for launch; PagerDuty is not.
- **Runbook (`docs/runbook.md`):** deploy, env vars, first-admin bootstrap, restore from backup, "vendor says the WhatsApp link is broken" (check `wa_links` row + number E.164 + template), "media 404s" (Apache content-type/docroot), "Vercel paused the project" (which limit, mitigation), "Paystack webhook not landing" (replay by reference, verify signature, re-run handler idempotently).
- **Health:** `GET /api/healthz` (DB ping, media driver ping, queue depth) + `gateway.php?op=ping`.
- **Status page** = a `platform_settings.maintenance` flag rendering a static page + `noindex`, not a second deploy target.

---

### 21.1 Backup and recovery (plan.md 56)

Daily `pg_dump` to a second location (Neon PITR where the tier allows, else a scheduled dump via `scripts/backup.ts` run on the host's cron pushing to object storage/free bucket). Media: nightly incremental rsync from the host + weekly full. **Restore is a rehearsed script, `scripts/restore.ts`, tested at M13 and quarterly** — an untested backup is a rumour. Retention: 7 daily, 4 weekly, 12 monthly. Exports: per-business JSON+CSV+media manifest on demand, retained 7 days in `private/exports` (signed URL only).

---

## 22. Build order (milestones)

Rule: every milestone ends deployable, with data, behind no feature flag. `M0-M8` = Phase 1 MVP as you scoped it (billing inert). Effort is in whole days of solo work, and the estimate that matters is *days where nothing breaks*, so each milestone carries its test obligation from §20.

| M | Deliverable | Acceptance | ~days |
|---|---|---|---|
| **M0** | Repo scaffold, Next 15 + TS strict + Tailwind tokens + kit stubs, `env.ts`, Drizzle + PGlite + migrate/seed scripts, CI, `docs/decisions/*` | `npm run dev` renders home from seeded DB; CI green on a trivial PR; `db:reset && db:seed` idempotent | 2 |
| **M1** | `users/sessions/businesses/user_roles/permissions/audit_logs` schema; signup, login, logout, scrypt, lockout+throttle, permission helpers, audit writer, `/admin` guard split | authz matrix green; a foreign tenant gets 403 on every action; failed-login throttle observable | 4 |
| **M2** | Catalogue engine: `business_types, catalogue_types, field_definitions, field_options, item_field_values, catalogue_items`; field registry (10 types) + dynamic form renderer + server validation; 3 seeded types (retail/service/course) | add a field in code->DB and it renders+validates+searches with no UI change; unknown key rejected; retyped field blocked | 6 |
| **M3** | MediaService + `local` driver + `gateway.php` + `gateway` driver, tickets/commit, checksum dedupe, quota meter, orphan status fields | upload->attached->delete round-trips on both drivers; quota blocks at 100% with an upgrade CTA; a broken commit leaves no half-row | 5 |
| **M4** | `whatsapp_numbers/routing/wa_templates/wa_links/inquiries`; CRUD, routing resolver, link builder, `/w/[code]` redirect + lead write, deep-link tests | message contains name/price/variant/qty/URL; number formats from `0803 123 4567` all resolve; a click creates exactly one lead | 4 |
| **M5** | Public: storefront, item page, gallery, variants read-only, CTA, share; `generateMetadata` + OG + JSON-LD + canonical + sitemap/robots + noindex rules | WhatsApp/linter reads a real preview card from the preview deploy URL; suspended store is `noindex` yet alive | 5 |
| **M6** | Vendor dashboard: overview, catalogue list (tabs/search/bulk/duplicate/archive), item editor w/ autosave-draft + More options, media manager, settings, storefront style+sections, onboarding wizard | a first-time vendor reaches "live" in <4 min from a phone; every state (empty/loading/error/quota) present | 7 |
| **M7** | Admin: overview KPIs, businesses/vendors approve-suspend-verify, catalogue moderation, categories/types/fields **builder UI**, payments queue (read-only over inert data), platform settings, CMS templates, audit viewer | every admin write audited with before/after; `finance_admin` sees only payments; field builder edits flow to vendor form without deploy | 6 |
| **M8** | Discovery/search: `/discover` faceted UI on FTS + filters incl. EAV filters, `/` homepage, buyer accounts (optional), favorites, recently viewed, enquiry history, `/contact` fallback form | a filtered query on "Duration = 6 weeks" is index-served < 50 ms at 100k seeded items; guest path never prompts login | 5 |
| | **= MVP gate: private beta, free plans, 0 revenue** || 44 |
| **M9** | Billing on: `plans/plan_quotas/plan_features/subscriptions/payments` + manual bank-transfer proof flow + admin verify/reject (one transaction) + activation gate + usage metering enforcement | approve flips payment+subscription+business+audit+notification atomically; double-click cannot double-verify; expiry computed at read time too | 5 |
| **M10** | Paystack hosted page + webhook verify + auto-activation + reconciliation view + refund marker; `PRO` plan needed before charging (§2.3) | replayed webhook is a no-op; forged payload with bad signature rejected; amount mismatch quarantined for admin | 4 |
| **M11** | Add-ons: catalogue + purchase (both paths) + `plan downgrade -> numbers disabled not deleted` + quota recalc + storage add-on | paying for +1 number unlocks exactly one slot for exactly its duration | 4 |
| **M12** | Jobs/cron on: expiry sweep, grace, notices, orphan cleanup, rollups, sitemap rebuild; Vercel Cron + `/api/cron` | after a simulated lapse a store shows "temporarily unavailable" + `noindex` + leads preserved; running the sweep twice is safe | 4 |
| **M13** | Analytics: ingest, rollups, vendor dashboard, admin platform view, load test | numbers match raw events for a seeded week; page reads rollups only | 4 |
| **M14** | Phase 2 remainder: offers, variants UI, WhatsApp cart, CSV import/export, QR/share pack, lead CRM polish, better search | 200-item CSV imports with per-row errors, nothing half-imported | 7 |
| **M15** | Staff/team (invites, roles), reviews (with a real mechanism: only businesses can invite; never open ratings), reporting/moderation queue, email notifications | manager cannot edit subscription; report -> action -> notification round-trip | 6 |
| **M16** | Phase 3: custom domains (verification + CNAME + per-host routing + noindex-until-verified), sub-admin granularity, vendor REST API + `api_keys`, referral program, PWA polish | a custom domain serves correct OG/canonicals (host-aware, not hardcoded to the platform host) | 8 |
| **M17** | Phase 4: WhatsApp Cloud API for *optional* auto-notifications, AI drafting, media pipeline hardening, backup restore rehearsal | only if volume justifies (§11 phase 4) | - |

**Sequencing judgement:** M2 before M4 deliberately (the link builder needs field values), M5 before M6 (build the public page first so the dashboard is shaped to feed a real page, not the reverse), and M9 after the "MVP gate" per your decision to prove the storefront before billing. M9-M12 are the first thing that touches money, which is why they follow a security/authz test suite rather than precede it.

---

## 23. Deferred, and why (so nothing is silently lost)

| Deferred | From | Trigger to do it |
|---|---|---|
| WhatsApp Business Cloud API | plan.md 4n, 11 ph4 | >500 leads/day per big vendor, or a paying enterprise vendor demanding confirmations |
| Cloudflare D1/Workers as primary | plan.md 47-48 | DB bill > $10/mo **and** storefront reads dominate; OpenNext deploy is the cheaper answer first |
| R2 for media | plan.md 13.7, 79 | 100 GB exhausted, or the host's media bandwidth becomes the bottleneck |
| Queues (broker) | plan.md 48 | jobs backlog > 10 min at steady state |
| Durable Objects | plan.md 48 | never, for this product's shape |
| React Native app | plan.md 9, 11 | vendor API (M16) proves demand; PWA in between |
| Page-builder / drag storefront | plan.md 26 | >20% of vendors ask for section control beyond toggles |
| AI descriptions/SEO/messaging | plan.md 61 | paying base of ~200 vendors (it is a premium add-on, not a core feature) |
| Multi-language | plan.md 10 | first non-English-first market; needs `locale` on items + URL prefix decision |
| Automated invoicing/tax | - | Nigerian FIRS e-invoicing obligations as they land for the platform's own revenue; legal review before automation |
| Enterprise impersonation | plan.md 36 | only with 2FA + audit + time-box, never before M16 |

---

## 24. Risk register

| # | Risk | Impact | Mitigation | Owner check |
|---|---|---|---|---|
| R1 | **Vercel Hobby ToS** (commercial use) suspends the project | product offline, domain burned, trust lost | 2.3 plan: Pro or Cloudflare before any charge; never launch on `.vercel.app`; `docs/runbook.md` pause playbook | gate at M9 (first money) |
| R2 | **Shared host is not an app host** — PHP/Apache limits, `post_max_size`, inode caps, killed processes, occasional host migrations | uploads/media availability | media is *files only*, no compute dependency; gateway is 1 file with no framework; bandwidth-heavy assets are the host's strength; media driver abstraction means "move to R2" is a config change, not a rewrite | M3 |
| R3 | **100 GB fills up** (video, unoptimized images, orphans) | storage exhaustion for everyone | client-side compression before upload, tier caps, dedupe by checksum, orphan sweep, quotas with 80/90/100 states, video plan-gated at 25MB/60s | M3, M12 |
| R4 | **EAV query performance** as verticals grow | slow discovery, timeouts on Hobby | core columns on items + generated projections + targeted indexes; filter = join on one `field_definition_id`; FTS via `tsvector`; load test at 100k items in M8; escape hatch = promote hot fields to generated columns on `catalogue_items` | M8 load test |
| R5 | **Admin config can break every vendor at once** (schema edits) | mass outage of vendor forms | `schema_version` + add-only edits + blocked retypes + a "preview as vendor" mode + `drizzle-kit check`-style lint on definitions + feature-flag the builder behind `is_active` | M7 |
| R6 | **Postgres cost/limits on free tiers** (Neon 512MB-ish, compute hours) | must migrate | DB is small by design (media never in DB, events rolled up, 90d retention); `postgres` driver + standard SQL means Neon -> Vercel Postgres -> RDS is a string change; D1 remains the documented fallback | M13 |
| R7 | **Manual proof fraud** (forged receipts, double-spend of one receipt image) | revenue loss, admin confusion | proofs are claims until verified; checksum dedupe flags the same receipt reused across businesses; bank reference is machine-parseable and matched against statements; approval requires typed amount match, never pre-filled | M9 |
| R8 | **Paystack webhook missed/delayed** | vendor paid, stays inactive | client-side "return" page *queries* Paystack `getTransaction` as a second confirmation path (never trusts the browser's claim), plus a `payment_reconcile` sweep for `pending` > 6h | M10 |
| R9 | **Free-riders/fake businesses** | moderation load, brand damage | plan enforcement + verification badge + reports + rate limits; do not open self-serve at scale before M15 | M15 |
| R10 | **Solo-builder bus factor** | stalled roadmap | this document + ADRs + seed/demo + runbook are the onboarding doc; boring stack chosen for exactly this reason | continuous |
| R11 | **Vendors treat it as an e-commerce store and expect checkout** | support load, refunds | copy discipline: "get orders on WhatsApp", no cart/checkout vocabulary outside the WhatsApp-cart naming, and the FAQ states plainly that payment happens in the chat (plan.md 64) | M6 |

---

## 25. Engineering constitution (from plan.md 79, made enforceable)

1. **Evidence before changes.** No feature lands without a trace to a `plan.md` section or a user-observed need; the traceability table in `docs/TRACEABILITY.md` is updated in the same PR.
2. **Server is the authority.** Any value that affects money, visibility, or another tenant is derived server-side. Payload claims are ignored or rejected.
3. **Every write is auditable.** Admin writes and money writes go through `audit(action, resource, before, after)` — a helper, not a convention.
4. **Full CRUD or explicit refusal.** If a resource exists in the UI, admin has view + one of (edit/soft-delete/archive), or the omission is documented here (e.g. `item_field_values` are edited through the item, never directly).
5. **Schema is code.** Migrations in git, no manual DDL on the server, `drizzle-kit` generates, humans review.
6. **No infrastructure without a driver.** A queue, a cache, a second DB, or a new cloud service needs a named bottleneck in this file first (that is why Durable Objects and R2 are absent).
7. **States are enumerated.** UI states (loading/empty/error/validation/network/server) and lifecycle states are part of the acceptance criterion, not a later polish ticket.
8. **Right-size the design.** Clarity beats spectacle for vendors; spectacle is spent only on public conversion surfaces.
9. **Delete carefully.** Soft delete by default, media via jobs, exports before purge; nothing silently destroys a vendor's customer data.
10. **Test the money and the link.** The two suites that must never go red are the authz matrix and the deep-link builder (plan.md 13.6).
11. **Deployable daily.** `main` is always releasable; a milestone not demoed with real data is not done.
12. **One storage story.** `MediaService` only; no code path writes to disk or a bucket directly (plan.md 79's amendment).

---

## 26. Launch gates

**Private beta (after M8):** 5-10 real vendors, free plans, no money, no public marketing. Success: 3 vendors with >10 live items; ≥1 real WhatsApp enquiry per vendor per day; wizard completed without help; zero cross-tenant incidents (checked in `audit_logs`).

**Commercial gate (before/with M10):** Vercel Pro (or Cloudflare) live; own domain; Paystack production keys + webhook HTTPS + verified-signature test; privacy/T&C/cookie notice; backups + a rehearsed restore; error tracking on; `admin` behind 2FA; TOS for vendors (listing rules, prohibited content, suspension terms); refund policy; support address; price list on plans; the "sales happen in your chat, we do not process them" disclosure.

**Scale gate (before M16 marketing push):** media bandwidth headroom measured, jobs backlog < 1 min, p95 storefront TTFB < 250 ms, moderation SLA < 24h, orphan sweep green for 30 days.

---

## 27. What is in this repo now (M0-M8 vertical slice, verified)

Runnable. `npm install && npm run db:reset && npm run db:seed && npm run dev`.

**Built and confirmed working**

| Area | State |
|---|---|
| Toolchain | Next 15 App Router, TS strict (`npm run lint` clean), Tailwind v4 tokens, Drizzle + SQL migrations in `drizzle/`, `scripts/db.ts` (migrate/seed/reset/jobs/verify) |
| Dev database | embedded **PGlite** (real Postgres, no server); `DATABASE_URL` switches to postgres-js/Neon with zero code change. Migrations are idempotent (re-run = "already up to date"). Seed is idempotent. |
| Schema | 50 tables across clusters 5.1-5.7 in `src/db/schema.ts`, incl. expression/partial indexes (`lower(email)`, `coalesce(business_id,'')` field-key uniqueness, `WHERE is_default` one-default-number-per-store) and `bigint` media quotas |
| Catalogue engine | `src/core/fields.ts` registry (21 field types) -> validation, form rendering, EAV projections, WhatsApp lines, filter building. `src/core/field-inputs.ts` keeps the client bundle free of the validator |
| Vendor CRUD | item editor with progressive disclosure ("More options"), draft autosave, optimistic-lock check on save, duplicate, publish/hide/archive, quota-gated publishing |
| Discovery | `/`, `/discover` with type + city + price + **EAV** filters. Verified live: filtering courses by `mode=online` returns only the online course, served from `item_field_values` projections |
| WhatsApp engine | e164 normalisation (incl. `0803…`, `+234 (0)803…`, `00234…`), template renderer with per-line collapse, `{{field:KEY}}` custom-field variables, routing resolver with inactive-number fallthrough, `/w/:code` redirect that records a lead before 302ing |
| Media | `MediaService` with `local` + `gateway` drivers, signature-sniffing validator (magic bytes vs declared MIME), UUID keys, checksum dedupe, orphan lifecycle columns, `docs/media-gateway/gateway.php` (dependency-free PHP 8, HMAC tickets, single-use, EXIF-strip via GD, signed expiring URLs for private files) |
| Public pages | storefront + item page with **server-rendered** `og:title/description/image:width/height/alt/url`, canonical, breadcrumbs, `noindex` for non-public stores, `sitemap.xml` (published-only), `robots.txt` (disallows dashboard/admin/api/account/w) |
| Structured data | JSON-LD emitted **per catalogue type** (Product/Offer/ProductVariant verified in the served HTML; Course/Service/Event/RealEstateListing paths in `buildJsonLd`) |
| Auth | scrypt (node:crypto, no native deps), hashed session tokens, httpOnly/sameSite=lax cookies, failed-login lockout, `requireUser`/`requirePermission`/`requireMembership`, `ROLE_GRANTS` for 7 platform + 6 vendor roles, audit writer |
| Vendor dashboard | overview (real counts, plan + storage meters, setup checklist, latest enquiries), catalogue, item editor, media manager with client-side compression, WhatsApp numbers + live message preview, leads board with status transitions, storefront style/sections, settings |
| Admin | overview KPIs + queues, payment review (approve/reject -> one transaction flipping payment + subscription + business + notification + audit), businesses (approve/suspend/verify), **schema builder** (create business type, add a field to a catalogue type with options/filterability, bumps `schema_version`) |
| Billing | **inert by your decision**: plans/quotas/features tables + enforcement are live (a free plan really is capped at 10 items / 1 number / 500MB), the payment queue operates on seeded rows, no paywall in front of vendors yet |
| Jobs | `jobs` table with claim-by-update, 55s time-box, exponential backoff, 8-attempt death -> visible in admin; handlers for orphan sweep, expiry/grace sweep, usage recount |
| Tests | `npm run verify` -> **32 passing, 0 failing**, covering the deep-link matrix, e164 forms, template collapse/lint, routing incl. plan-downgrade, 8 field-validation rules, projections, slug/XSS/money helpers, and role isolation. It caught 6 real bugs during this build (see below) |

**Six bugs the suite caught and fixed** (worth keeping as regression cases): `+234 (0)803…` normalised to a wrong number; letters in a phone number were silently mangled into a valid-looking one; `javascript:` URLs passed `.url()` validation; select filters stored the raw option value so searching "L" missed "l"; a 1-character slug was accepted; the retail template dropped custom fields and duplicated the quantity line.

**Known gaps in this slice** (all scheduled, none structural): onboarding wizard as a distinct flow (signup lands straight on the dashboard); Paystack + real payment intake (M10); cron wiring on the host (M12; `npm run jobs:run` works today); analytics rollup table is populated by hand, not by a job (M13); offers/variants UI is read-only on the public side (editor comes in M14); CSV import/export, QR codes, buyer accounts, custom domains, team invites.

**Operational note:** only one process may own the PGlite data directory at a time - do not run `db:seed`/`db:migrate` while `npm run dev` is up (symptom is a hang, not an error). `db:reset` is refused when `DATABASE_URL` is set, so a remote DB can't be wiped by accident.

## 28. Open questions (blocking nothing; answer when convenient)

1. **Price points** for Free/Starter/Business/Enterprise and add-ons — engine is ready, numbers are admin data. The `plan_quotas` table means you can experiment without me.
2. **Legal wrapper**: which entity receives Paystack payouts, and do you have a T&C/privacy drafter? Vendors are your customers, not ours' — a "we don't handle your sale" clause matters (R11).
3. **Do buyers get an account in the beta, or is `/account` withheld until M15?** Optional accounts are cheap to ship and cheap to fake-traffic; my recommendation is to ship favorites-only and defer enquiry history.
4. **Video**: allow at all in beta? Recommendation: no (images only, ≤ 10 per item) until the storage trajectory is visible.
5. **The shared host**: can you create a subdomain (`media.<domain>`) with a docroot you control, and is PHP 8 + Imagick/GD available? The gateway needs `gd` or `imagick` for variants; without either we ship `gateway.php` with variants disabled and thumbnails produced client-side (the flow already supports this).
6. **Domain**: is the public app on its own domain from day 1 (recommended), or a subpath of an existing site while in beta?
