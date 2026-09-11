# CyberShop — Decision Ledger (ADRs)

Each entry: Decision · Evidence · Reason · Risk · Status.

## D-001 — WhatsApp: `wa.me` deep links only (no WhatsApp Business API)
- **Decision:** All buyer→vendor contact is a pre-filled `wa.me/{number}?text=…` click-to-chat link. The item page URL is included in the message so WhatsApp's link preview (from OG tags) shows the item image.
- **Evidence:** Confirmed plan §0/§4. Zero cost, no Meta approval, no webhook dependency.
- **Risk:** No automated confirmations (accepted; Phase 4 may add Cloud API *in parallel*).
- **Status:** Final.

## D-002 — Media storage: vendor's existing 100GB cPanel hosting, behind a MediaService abstraction
- **Decision:** Files persist on the existing hosting. `MediaService` interface (upload/delete/replace/url/validate/optimize/thumbnail/metadata) with swappable drivers. Driver = local disk if the app is co-located on that host; SFTP push if the app runs on a separate VPS. Public media served from a normal HTTPS web directory; private media (payment proofs, documents) stored outside the public root and served via an authorized route.
- **Evidence:** Plan §7; 100GB hosting is an explicit project requirement (overriding the master prompt's R2 default).
- **Risk:** Single-host media = single point of failure → periodic backup job documented. 100GB shared across vendors → per-plan storage quotas + optimization + orphan cleanup are mandatory, not optional.
- **Status:** Final (driver choice follows D-011).

## D-003 — Dynamic category engine: JSON field schema per category, JSON values per item
- **Decision:** `categories.field_schema` (JSON array of typed field defs) drives the item form; `listings.custom_fields` stores values. Admin can create new industries without a code deploy. `item_types` (Product/Service/Course/Event/Property/Digital) supply the URL segment, CTA label, default template key, and schema.org type.
- **Evidence:** Plan §3 ("EAV or JSON-schema-per-category — recommended: JSON schema per category + JSON values alongside standard fields").
- **Risk:** Weaker queryability than strict EAV → mitigated by keeping the important queryable attributes (name, price, status, category, type, business) as real columns; custom fields are display/CTA data in Phase 1.
- **Status:** Final.

## D-004 — Payments: Payment Intent model with two verified paths
- **Decision:** One `payments` table (method: bank_transfer | paystack | manual). Bank path = human verification (proof is a *claim* until an admin approves). Paystack path = webhook with HMAC signature verification auto-approves; a mock/simulated mode exists for dev so the flow is testable without a live key.
- **Evidence:** Plan §0, §5, §13.1 ("verify Paystack webhooks with the signature/secret… treat manual proof uploads as claims until admin approves").
- **Risk:** Paystack live keys not yet provided → environment-gated; mock mode clearly flagged, never the production default.
- **Status:** Final (live keys = external dependency).

## D-005 — Buyer accounts optional
- **Decision:** Guests can browse and contact vendors with zero friction. Accounts add favorites, recently viewed, and inquiry history.
- **Evidence:** Plan §0 ("Anonymous browsing/purchase-click is fully supported").
- **Status:** Final.

## D-006 — Monetization = admin-defined plans + separately priced add-ons
- **Decision:** `plans` (quota JSON: numbers, storage, items, categories, staff, featured) + `addons` (extra number, extra storage, featured, extra category, staff). Quotas = plan + active add-ons, enforced server-side.
- **Evidence:** Plan §0, §10, §11.
- **Status:** Final.

## D-007 — "Inquiries/leads", not "orders"
- **Decision:** The platform records *intent* (inquiry rows + analytics events). There is no checkout, no order state machine on the platform side. Lead status tracking is a Phase-2 CRM.
- **Evidence:** Plan §1, §4 (sale happens on WhatsApp).
- **Status:** Final.

## D-008 — Server-rendered public pages (OG tags + SEO)
- **Decision:** Storefront and item pages are server-rendered with per-page title, meta description, canonical, Open Graph, and schema.org structured data. WhatsApp's crawler does not execute JS; SSR is the only reliable way to get preview cards.
- **Evidence:** Plan §4, §9, §13.4.
- **Status:** Final.

## D-009 — Multi-tenancy by ownership boundary
- **Decision:** Every vendor-owned row carries `business_id`; all vendor-scope queries are scoped to the session's business. No client-supplied `business_id`/`role` is ever trusted. Admin routes use a separate guard.
- **Evidence:** Plan §13.1 (IDOR), master prompt §25.
- **Status:** Final.

## D-010 — Currency & locale
- **Decision:** NGN (₦) default with per-row currency code; Nigerian formatting (₦1,250,000). English UI first; i18n-ready structure (no hardcoded strings in critical flows).
- **Evidence:** Plan (₦ examples throughout).
- **Status:** Final.

## D-011 — Tech stack & deployment placement — **RESOLVED**
- **Decision:** Option D (derived from the user's actual available resources: Vercel free,
  Cloudflare free tier, cPanel shared hosting ~100GB):
  - **Vercel:** Next.js 15 (App Router, SSR) for all three UIs (public marketplace,
    vendor dashboard, admin). Browser calls same-origin `/api/*`, proxied to the Worker —
    no cross-origin session/CORS issues, relative URLs everywhere.
  - **Cloudflare Worker (Hono) + D1 (SQLite):** all business logic — auth, authorization,
    catalogue, billing, payments (Paystack init + HMAC-verified webhook), analytics,
    rate limiting, cron jobs. D1 free tier (5GB) holds relational data + small private
    media (payment proofs, dev-mode media). D1 migration mirrors `docs/schema.sql`
    (MySQL doc kept as the canonical relational design for a future Postgres/MySQL move).
  - **cPanel PHP media gateway:** token-signed upload endpoint on the shared host that
    writes public vendor media to the 100GB disk and serves it at a plain HTTPS URL
    (required for WhatsApp/OG previews). Replaces the master prompt's R2 default per
    plan §13 and the 80-section architecture doc §10/§79 ("SFTP-backed media service →
    existing 100GB hosting").
- **Reasoning:** Matches the user's free-tier resources exactly. Workers cannot hold
  SFTP sessions, so the co-located PHP gateway makes "SFTP" collapse to a local disk
  write. SSR on Vercel delivers the OG tags WhatsApp's crawler requires (D-008).
- **Risk:** Free-tier limits (Worker 100k req/day, D1 5GB, Vercel 100GB bandwidth) are
  fine for MVP; all three have paid tiers with the same architecture (no re-architecture
  to scale). Media single-host risk → documented backup procedure.
- **Status:** Final (2026-09-10).

## D-012 — Design register — **REVISED 2026-09-11 (owner request)**
- **Decision (v2):** Two registers, one dark brand:
  - **Public buyer experience = the most immersive the stack can honestly do**
    (owner explicitly requested "all effects, animations, transitions, elegance,
    and utmost beauty"): "The Night Market" identity — cinematic dark emerald &
    gold, self-hosted Fraunces display serif (360KB variable TTF, zero runtime
    third-party font requests), glass surfaces, film-grain overlay, drifting
    aurora + scroll parallax, per-word hero reveal, staggered scroll reveals
    (IntersectionObserver), Ken Burns storefront covers, pulsing WhatsApp CTAs,
    category marquee, count-up stats, curtain page transitions, sheen hovers,
    crossfading gallery. All motion is CSS/transform + ~60 lines of JS (no
    animation libraries), SSR/OG untouched, and fully disabled under
    `prefers-reduced-motion` (content-first fallback).
  - **Vendor dashboard + admin keep the same dark brand but stay
    clarity-first** (unchanged principle): no ambient effects, only fast
    micro-transitions (row hover, active-nav indicator, button feedback).
    Audience = low-tech-confidence vendors; immersion there would slow them down.
- **Evidence:** Owner request 2026-09-11 ("most immersive design possible …
  utmost beauty") overriding the v1 right-sizing; plan §13.5's dashboard
  principle retained. React 19.3's `<ViewTransition>` does not interop under
  Next 15.5's server transform (verified: renders undefined) → custom veil
  transition used instead.
- **Risk:** Motion cost on low-end mobile + data plans → mitigated: transform/
  opacity only (GPU), no new JS dependencies, no WebGL/Lottie, font is
  self-hosted with swap, reduced-motion honored.
- **Status:** Final (v2).

## D-013 — Data lifecycle
- **Decision:** Soft delete on businesses, listings, media, users. Item states: draft → published → archived. Payment states: pending → submitted → reviewing → approved | rejected (→ new intent on resubmit). Media: uploaded → attached → unused → orphaned (grace ≥ 7 days) → deleted.
- **Evidence:** Master prompt §85, plan §13.2 (orphan cleanup, no immediate file deletion).
- **Status:** Final.

## D-014 — Security baseline
- **Decision:** Argon2id/bcrypt; session cookies (HttpOnly, Secure, SameSite=Lax); per-endpoint rate limits (login 5/15min, register 3/hour/IP, reset 3/hour/IP, upload 10/10min, inquiry 5/min); magic-byte MIME validation + extension allowlist + UUID filenames + EXIF strip; rate-limited public forms; audit log for admin mutations and payment transitions; private media behind authorized route; no raw IPs stored (salted hash only).
- **Evidence:** Plan §13.1, master prompt §24–§31.
- **Status:** Final.

## D-015 — No fake data in production paths
- **Decision:** Seed data (categories, plans, add-ons, templates, item types) is legitimate default configuration, clearly marked, admin-editable. No fake vendors/products/stats. Empty states shown when real data is absent.
- **Evidence:** Master prompt §88, plan §13.
- **Status:** Final.
## D-016 — Media gateway verification without a PHP runtime
- **Decision:** The development sandbox cannot install PHP (no apt mirror access, no container runtime), so `media-gateway/upload.php` is verified by (a) careful code review against the worker's token contract, (b) `contract-check.py` — real worker-issued tokens validated by a faithful port of the gateway's verification logic (10 checks: signature, expiry, key prefix/segments, size, secret mismatch), and (c) `test-upload.sh` — a full E2E harness (token → PHP upload → serve → worker finalize) that is **mandatory** to pass on the first PHP host before `MEDIA_DRIVER=gateway` is flipped in production. Worker-side bugs found by this process (finalize token-length cap of 64 vs real 163-char tokens; broken single-use claim) are now covered by integration tests (29 total).
- **Evidence:** Sandbox network restrictions (2026-09-10); both bugs found by contract testing, not by review alone — justifying the two-script gate.
- **Risk:** PHP-specific runtime behavior (ini limits, mod_php vs LiteSpeed, GD presence) only surfaces on the host → deployment guide §3.5 + §7 checklist gate it.
- **Status:** Final.

## D-017 — Paystack activation: server-to-server verification, not webhook signatures
- **Decision:** The webhook handler extracts only the transaction `reference` from the (untrusted) body, then calls Paystack `GET /transaction/verify/{reference}` with the secret key; activation requires the authoritative API to report success. The webhook body is never trusted for state changes.
- **Evidence:** Plan §13.1 ("never trust client-side claims — payment success, vendor_id, role"); Paystack's own recommended verification pattern; stronger than header signatures because a forged webhook cannot reference a charge that didn't succeed.
- **Risk:** Each webhook triggers an outbound Paystack API call (cost ≈ 0 on free; rate-limited by Paystack) — accepted.
- **Status:** Final.

## D-018 — Design v3 "Fluid Material" layer — scope decisions (2026-09-11, owner blueprint)
- **Decision:** Owner supplied a full "luxury immersion" blueprint. It was implemented where
  it fits the product, and deliberately not implemented where it contradicts it:
  - **Built (public):** shared-element **card ⇄ detail morph** (FLIP technique; a catalog
    card expands into the item header; reverse via swipe-down on the image or the back
    chip; overlay + scrim are imperative DOM owned by a layout-level bridge so they
    survive Next's page unmount; content cascades in on landing). **WhatsApp
    swipe-to-buy** slider (shimmering liquid fill + wave edge, velocity-assisted
    release, thumb pop, localized confetti burst, haptic double-tap, fade-to-black
    while the wa.me link is pulled into view). Pointer/gyro **tilt parallax** with
    specular highlight on cards (≤4.5°), **luminous shimmering gradient borders**
    (wa-card, auth cards), **skeleton shimmers** shaped to the real media (tied to
    actual image loading), **elastic rubber-band** end-of-list stretch (touch only),
    **haptic landscape** (pop/double/deep/long via navigator.vibrate, no-op on iOS).
  - **Built (vendor):** proof-upload **drop-zone** with marching-ants border,
    **liquid fill driven by real XHR upload progress**, drawn checkmark; **category
    theme morph** — each industry carries an accent duet (Tech→neon blue, Bakery→warm
    earth, Fashion→rose, Real-estate→teal, Auto→gold, Health→teal-green; default
    emerald/gold) applied to the storefront accents/ambient glow AND the vendor's own
    dashboard, so the vendor recognises their brand surface.
  - **Not built (contradictions, documented not faked):** "add to cart" fly-to-cart —
    the product has **no cart** (D-001/D-007: purchase = the WhatsApp conversation;
    the swipe-to-buy slider IS the liquid purchase gesture). Voice record button +
    liquid waveforms — the data model has **no audio yet** (would be a schema feature,
    not styling). "SFTP tunnel upload" — media rides the cPanel gateway (D-002/D-011);
    shimmers track real loads instead of a tunnel. Gyro on iOS needs a permission
    prompt on user gesture — we don't prompt (Android fires freely; iOS gets the
    static ambient instead).
- **Evidence:** Owner blueprint 2026-09-11 ("fluid like liquid, tactile like physical
  paper… premium editorial"); D-001/D-007 (no cart), D-002 (media path), D-015
  (no fake features).
- **Risk:** Flip morph edge cases (deep-link back, off-screen cards, aspect-ratio
  changes) → mitigated: rAF polling for targets, scroll-into-view before the reverse
  fly, 4s staleness timeout, 900ms no-navigation recovery in `flipBack()`, and the
  whole layer is inert under `prefers-reduced-motion` (plain navigation + button CTA).
  Popup blockers: slider path falls back to same-tab `location.href` if
  `window.open` is blocked.
- **Status:** Final (v3).

