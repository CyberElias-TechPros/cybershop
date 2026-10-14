# Expert critique — CyberShop from every seat in the room (2026-10-14)

Method: hands-on inspection of the running app (seeded demo data) plus the
codebase, judged from eleven seats: **guest buyer, registered buyer, new
seller, growing seller, power seller, store staff, admin/operator, support,
and the expert lenses — product/UX, engineering (perf, a11y, SEO, security),
trust & safety, growth/monetisation, and Nigerian-market fit.**
Scores are 1–5 for the experience *today*, not the ambition.

Already fixed in earlier rounds (not re-litigated here): shop-first
homepage, `/sell`, unified search, grouped navigation, store themes,
responsive scale, Help Centre.

## Scorecard

| Seat | Score | One-line verdict |
| --- | --- | --- |
| Guest buyer | 4 | Fast to browse, honest badges; images and search depth are the ceiling |
| Registered buyer | 3 | Saved/alerts work, but the account gives too little back |
| New seller | 4 | Guided and honest; plan gate can stall momentum before first listing |
| Growing seller | 4 | Leads + templates + analytics are a real toolkit |
| Power seller | 3 | Hits ceilings: no bulk tools, no buyer CRM beyond leads, no API |
| Store staff | 3 | Own logins exist; no roles/permissions granularity |
| Admin/operator | 4.5 | Audit, reconciliation, health — unusually disciplined |
| Support | 3 | Contact + help centre; no ticket thread view tying to user context |
| Trust & safety | 4 | Best-in-class honesty; deposits/jobs remain the sharp edges |
| Growth/monetisation | 3 | No transaction take-rate and no product analytics to learn from |
| Nigerian-market fit | 4 | WhatsApp-first is exactly right; English-only and data weight are gaps |

## 1. Guest buyer

**Works.** Browse-without-account, two-up mobile grids, honest badges
(Verified ID ≠ Featured ≠ rating), safety ribbon, WhatsApp cart that
groups by store. This is the correct shape for the market.

**Hurts.**
- **Product images carry `alt=""` and no dimensions** (`ListingCard`,
  `ItemCard`). Screen readers hear nothing; layout shifts as images load
  (CLS); crawlers get no image context. This is simultaneously the
  biggest accessibility, SEO *and* perceived-performance bug on the site.
- **Full-size originals are served to phones** (`/api/media/file/N`, no
  resized variants, no `next/image` anywhere — 21 raw `<img>`). On a
  ₦200 data budget, a seller's 4 MB photo is the buyer's problem. In this
  market, bytes are a feature.
- **Search is LIKE + stemming** (`worker/src/lib/search.ts`). Fine at
  hundreds of listings; it will not survive typos, synonyms ("sneakers"
  vs "trainers"), or 10k+ listings. No zero-results recovery beyond
  "save this search".
- **No homepage JSON-LD** and listings pages have no ItemList structured
  data (storefronts have it — extend it).

**Fixes.** P0: real `alt` from listing names + width/height (dims are
already stored in `media`). P0: server-side image variants (thumb/card/
full) — the media gateway is the right place. P1: search synonyms +
typo tolerance (FTS5 on D1), zero-results suggestions.

## 2. Registered buyer

**Works.** Saved items/stores, saved-search alerts, enquiry history,
reviews tied to real interactions, 2FA.

**Hurts.** The account is a filing cabinet, not a relationship: no
"stores you follow have new items" feed, no price-drop alerts on saved
items, no recently-viewed across devices (the recent rail is local).
There is currently no reason for a happy guest to register until the
moment they need one of these — so most never do.

**Fixes.** P1: following-a-store digest (email + in-app). P1: price/stock
change alerts on saved items. P2: prompt registration *at value moments*
(after first enquiry/save) rather than in the header.

## 3. New seller

**Works.** Register → plan → guided onboarding wizard, free tier needs
no payment, storefront themes make a day-one store look established,
help guides for every step, store-strength prompts.

**Hurts.** If anything interrupts onboarding (payment proof pending),
the catalogue greets them with "Your store isn't live yet" — preparation
is allowed in the wizard, but the emotional message is "wait". Sellers
churn in exactly this window. Also: no import path (Instagram/WhatsApp
catalogue/CSV) — re-typing 40 products on a phone is the real competitor
to onboarding, not other platforms.

**Fixes.** P0 (copy/flow): let pending-plan sellers build everything and
frame it as "your store opens the moment payment clears — fill it now".
P1: CSV/photo-batch import; P1: "share your store" kit (QR + WhatsApp
status copy) automatically at activation — sellers' first traffic is
self-brought.

## 4. Growing seller

**Works.** Leads inbox with unread badge, offers, message templates,
analytics funnel (view → WhatsApp tap), reviews, verification, media
library, themes. A genuinely coherent growth toolkit.

**Hurts.** Analytics stop at the tap: what happened *in* WhatsApp is
invisible, so sellers can't tell CyberShop's ROI story to themselves —
and churn follows unmeasured value. No lead states (new/contacted/sold/
lost), so the inbox becomes a pile, not a pipeline.

**Fixes.** P1: lead pipeline states + "mark as sold" (also seeds honest
"X sold" social proof). P1: weekly WhatsApp/email performance digest to
sellers ("12 taps, 3 marked sold"). P2: response-time badge ("usually
replies within an hour") — sellers will compete on it.

## 5. Power seller

**Works.** Team invites, custom domain, deposits ledger, receipts.

**Hurts.** Ceilings everywhere: no bulk price/stock edit, no duplicate
listing, no CSV export of leads, no multi-store view for operators with
3+ businesses, no API/webhooks. Power sellers are your cheapest growth
channel; today they outgrow you into spreadsheets.

**Fixes.** P2: bulk edit + duplicate; CSV lead export; multi-business
switcher. P3: read-only API keys.

## 6. Store staff

**Works.** Individual logins, owner never shares a password, invite
revocation, audit trail.

**Hurts.** One implicit permission level: the intern who replies to
chats can also open Plan & billing and Verification. For businesses
handling money-adjacent data (deposits), that's a real-world problem.

**Fixes.** P1: two roles minimum — *Staff* (catalogue, leads, inbox,
media) vs *Manager* (+ billing, verification, team, settings). Enforce
server-side, show/hide in nav secondarily.

## 7. Admin / operator — 4.5, the strongest seat

**Works.** Verification queue, reports, reconciliation-before-activation
(the guide even warns: never activate on a screenshot), subscription
management, health, immutable audit log, grouped admin nav, help docs.

**Hurts.** No saved moderation views (e.g. "vendors with reports + no
verification"), no SLA/ageing on queues, no bulk actions. At 10x vendor
count the queue UX — not the policy — becomes the bottleneck.

**Fixes.** P2: queue ageing badges + bulk approve/reject for low-risk
classes; saved filters.

## 8. Support

**Works.** Contact page, copy-email footer, Help Centre with 24 guides,
safety page, report flows into moderation.

**Hurts.** Support is a mailbox, not a system: no ticket IDs, no thread
history per user, no way for support to see "this user's store/payment"
while answering. The Help Centre reduced repeat questions; the remaining
ones arrive context-free.

**Fixes.** P2: lightweight ticket model (even just threading contact
submissions per email + status), and an admin-side user timeline
(account, store, payments, reports) to answer in one look.

## 9. Trust & safety

**Works.** The honesty architecture is the product's moat: ratings only
from real reviews, Verified ID ≠ paid Featured, no fake escrow claims,
deposit ledger framed as *record-keeping*, job-scam warnings, safety
ribbon, report paths, CSP/HSTS, httpOnly SameSite=Lax sessions, rate
limits (20 call sites), origin checks, 2FA, session device list.

**Hurts.** (a) The deposit add-on is the one feature a bad seller can
weaponise ("pay deposit into my account, CyberShop records it") — needs
buyer-side friction: when a deposit-recorded business is reported, flag
its deposit records in admin. (b) No visible anti-phishing story:
buyers are trained to move to WhatsApp, where impersonation is free;
the help guides cover it, but the moment of danger is in-chat, off-site.
(c) Review bombing/coordinated fake enquiries have no rate story yet.

**Fixes.** P1: deposit-report cross-flag in admin; seller "official
links" block on storefronts (only these numbers are us). P2: per-seller
enquiry anomaly alerts. Keep doing the honesty thing — it *is* the brand.

## 10. Growth & monetisation

**Works.** Plans + add-ons (Featured, deposits, domain), referral lib,
share bars, per-store OG cards, sitemap from worker, activation digests.

**Hurts.** (a) **No product analytics at all** — no funnel truth for the
platform itself. Privacy-respecting measurement (Plausible-style,
self-hosted/first-party) is compatible with the brand; flying blind is
not. (b) **No take-rate and no plan to get one**: subscriptions cap
revenue at vendor count × small ARPU. The credible path is paid
visibility + add-ons (already started) — then seller ROI proof (§4) is
what makes those renewable. (c) Sitemap **silently falls back to just
the homepage if the worker call fails** (`web/app/sitemap.ts`) — an SEO
outage that looks like success. (d) English-only: Pidgin-first UI copy
for key buyer flows is untested territory competitors will take.

**Fixes.** P0: alert on sitemap fallback (and long-cache a last-good
copy). P1: first-party product analytics with a published privacy note.
P1: seller digest (§4) as the retention engine. P2: Pidgin experiment on
homepage + buying-safely.

## 11. Engineering & reliability (cross-cutting)

**Works.** TypeScript both ends, CSP/HSTS headers, error/global-error
boundaries, loading states for dashboards, PWA manifest + offline page,
self-hosted subset font (104 KB), skip link, focus-visible, reduced
motion support, cascade/dead-CSS audits in-repo, worker test suite.

**Hurts.** (a) CSS is 40.7 KB gzip vs a 32 KB budget — documented
pre-existing, still unpaid debt. (b) No client error reporting tied to
the worker's `errorlog` (check it actually receives browser errors).
(c) 191 KB homepage HTML (RSC payload duplication) — fine on fibre,
felt on 3G. (d) `overflow-x: clip` now prevents sideways scroll, but
masking can hide future overflow bugs; keep the audit habit.

**Fixes.** P1: pay the CSS budget down by splitting cine.css per route
group. P2: error reporting endpoint check; HTML weight audit.

## Prioritised roadmap

**Now (P0)**
1. Image `alt` + dimensions + resized variants (buyer a11y/SEO/data-cost).
2. Pending-plan sellers: full catalogue prep with "fill it now" framing.
3. Sitemap fallback alerting.

**Next (P1)**
4. Lead pipeline states + mark-as-sold + seller weekly digest.
5. Staff role permissions (Staff vs Manager).
6. Store-follow digests + saved-item price/stock alerts (buyer value loop).
7. Search synonyms/typos (FTS5) + zero-results recovery.
8. CSV/photo-batch catalogue import.
9. First-party product analytics.
10. Deposit-report cross-flag in admin.

**Later (P2/P3)**
11. Bulk catalogue tools, lead CSV export, multi-business switcher, API keys.
12. Response-time badges; admin queue ageing/bulk actions; support ticketing.
13. Pidgin buyer-flow experiment; CSS budget paydown to ≤32 KB.

## What NOT to do

- **Do not add a checkout/escrow** to "fix" trust. The WhatsApp-direct
  model is the market fit; the honesty architecture is the moat.
- **Do not gamify ratings** (no "Top Rated" badges without review volume
  behind them).
- **Do not ship a native app** before the PWA + Galaxy Store listing
  carry their weight; distribution is not the bottleneck — liquidity is.
- **Do not add a feed/algorithmic home** until search + categories are
  deep; marketplaces die of empty shelves, not boring shelves.

## The one-sentence version

CyberShop's bones — honesty, WhatsApp-first, seller tooling, admin
discipline — are better than most funded marketplaces; its ceiling is
now **media weight, search depth, and unmeasured value** (buyers can't
feel data costs, sellers can't see ROI), so the next quarter should be
spent making value *visible* and pages *light*, not adding surface area.

---

## Implementation status (same day, after "do everything")

The roadmap was executed against ground truth; three critique items turned
out to be already built (better than sampled) and are corrected here.

**Corrections — already existed, critique updated:**
- Lead pipeline states (new → converted/lost) with dashboard UI — existed.
- Staff roles (manager/sales/catalogue/support/accountant) enforced
  server-side per-route in `worker/src/lib/access.ts` — existed. What was
  missing (nav hiding per role) is now done in `DashNav`.
- Pending-plan sellers could already build their catalogue; only the
  framing changed ("keep building — it goes on sale when your plan
  activates", catalog + overview banners).
- CSV catalogue import (drafts, 200 rows) and catalogue/leads CSV export
  already existed end-to-end. A duplicate import endpoint built during
  this pass was removed again in favour of the existing one.
- Platform stats (vendors, listings, WA clicks, revenue) already on the
  admin overview; a 7-day views→taps→leads funnel card was added.
- Catalogue "Your store isn't live yet" already explained saved-but-hidden.

**Now (P0) — done:**
1. Images: descriptive `alt` on listing/item cards, width/height attrs,
   4:3 aspect-ratio boxes (already present), and browser-side downscale
   at upload (≤1600px JPEG q0.82) so new photos stop costing buyers'
   data. Remaining: server-side variants for the existing catalogue
   (needs image tooling in the PHP gateway — tracked, not faked).
2. Pending-plan framing (above).
3. Sitemap: last-good inventory served stale on worker failure, with a
   loud server log — never silently just the homepage.

**Next (P1) — done:**
4. Seller weekly digest in the hourly cron (views/taps/leads/sold from
   `analytics_daily` + inquiries, once per ~7 days per store via
   `alert_state`, email-mirrored) — verified live (seller_digests: 1).
5. Staff-role nav filtering in `DashNav` mirroring `ROLE_PATHS`.
6. Buyer loops: saved-item price-drop & back-in-stock alerts (snapshot
   at save time, hourly cron, re-baselined after firing — verified
   end-to-end), store-follow "new listing" notifications on publish,
   saved-search alerts (already existed).
7. Search: FTS5 index (migration 0014, trigger-synced) with synonym +
   plural-variant expansion, LIKE fallback on any FTS failure — the
   existing search test initially caught the plural direction bug.
8. Support ticketing: ticket + thread tables, public create (guests),
   account thread view, admin queue with age, notify on reply.
9. Deposit × report cross-flag in the admin reports API + 💰 chip.
10. Browser error beacons (`/api/public/client-error`) now feed the same
    `error_log` admins watch; wired into both error boundaries.
11. Response-time badge on storefronts ("⚡ Usually replies within ~X",
    median of real `first_response_at`, only with 5+ samples).
12. Business switcher for staff with seats in several stores
    (`user_active_business` + `/vendor/businesses|switch`, honoured in
    `resolveVendorBinding`); hidden for single-store users.

**Later (P2/P3) — done or consciously deferred:**
13. Bulk catalogue actions (stock flip, publish/archive, ±% price) for
    the current page, on top of the existing duplicate/exports.
14. Read-only API keys (hashed, shown once, revocable) + public
    `GET /api/public/catalog` — verified live.
15. Admin support queue ageing (created-age column + status filter).
16. Pidgin experiment scaffold: English/Pidgin hero toggle (persisted
    per device) to measure before any full i18n commitment.
17. CSS: Help Centre styles split into route-scoped `help.css`;
    `css-budget.mjs` now reports **every route within the 32 KB budget**.
- Deferred, deliberately: multi-store *creation* for owners (ownership
  model is one business per owner today; the staff switcher covers the
  multi-seat reality), admin bulk moderation actions (high-risk clicks
  deserve one-at-a-time decisions; SLA ageing already existed), and
  server-side image variants for legacy media (gateway tooling).
