# CyberShop — UI/UX critique (all roles) and what changed

Date: 2026-10-14 · Scope: public shop, storefronts, vendor dashboard, admin,
store-listing presence · Trigger: *"the homepage should be the shop of
products of the vendors, not everything the app can offer"* — plus a request
to critique the UI/UX itself, in every role.

Severity: **S1** blocks the task · **S2** costs conversion/trust · **S3** polish.
Status tags: **Fixed** (in this change) · **Open** (needs a decision, data, or
a browser — see §6).

---

## 1. The verdict in one paragraph

The plumbing was ahead of the shop window. Payments, moderation, quotas,
reviews, analytics and safety were unusually complete, while the front door
explained the concept with an animated phone and showed **zero products**.
This change inverts the hierarchy: **homepage = the market, `/sell` = the
pitch, categories = aisles of listings, one search = the shop feed.** What
remains wrong is mostly not missing features — it is density (a marketplace
with few listings looks empty by design now), visual verification (still
never seen in a real browser), and a motion budget that should be spent on
product photos, not particles.

## 2. Role-by-role critique

### 2.1 First-time buyer (WhatsApp link / Google, cheap Android) — was S1, now S2

- **Was:** 1.2s brand curtain → particle field → fake WhatsApp chat with the
  platform owner's academy → how-it-works theatre → *stores*, still no
  product. The visitor's question "what can I buy, for how much?" had no
  answer above the fold.
- **Fixed:** `/` opens on search + city, then real listings with price,
  seller, city, freshness and availability. Real counts ("13 listings · 1
  business") replace vanity stats ("0 accounts needed"). The fake chat and
  the three-Act ritual are gone from the shop; the honest three-line version
  sits below the feed.
- **Open:** the intro curtain, tilt and particles still exist site-wide
  (`Atmosphere`, `Fx`). They are gated/throttled, but on a ₦60k phone every
  millisecond of garnish competes with the first product photo. Recommend a
  `prefers-reduced-data` pass that drops them entirely (see §5).

### 2.2 Returning buyer — was S2, now mostly fixed

- **Was:** five overlapping discovery doors (Listings, Businesses,
  Categories, Search, Jobs), two different search systems (`/search` mixed
  results vs `/listings` filters), no memory of the visitor.
- **Fixed:** one shop (`/listings`); header/hero search and `/search` all
  land there (308, parameters preserved). City is chosen once in
  `ShopSearch` and remembered (`localStorage cs-city`). Recently viewed
  listings (already recorded on every item page) now surface as a
  "Continue looking" rail on the homepage — invisible to first-timers, so
  no empty personalised furniture.
- **Open:** saved-search alerts exist server-side but have no visible home
  on `/`; a "New in <your city>" rail needs the city to also shape the
  SSR feed (today it shapes the *link*, not the server render — deliberate,
  to keep anonymous caching correct).

### 2.3 Card shopper ("just browsing") — was S2, fixed

- **Was:** `ListingCard` = photo, price, name, seller. No rating, no age,
  no stock, no way to save without opening the page; "Verified"/"Boosted"
  chips unexplained and visually equal.
- **Fixed:** cards carry seller rating (only when reviews actually exist —
  never invented), "· 4 min ago", out-of-stock and negotiable/from cues,
  and a save button (a sibling of the stretched link, so the
  jsx-nesting audit stays green). Badge hierarchy is now explicit and
  explained where buyers stand: **✓ Verified ID** (identity checked) >
  **Featured** (paid highlight, gold, labelled as such in the tooltip and
  in the `/listings` intro). `BusinessCard` shows listing count + rating
  + Verified ID/Official-store marks instead of a lone "Featured" chip.

### 2.4 Small vendor (the paying customer) — was S1/S2, now S2

- **Was:** plans invisible until *after* registration; registration demanded
  category + WhatsApp number before any value was shown; a 17-item dashboard
  where Leads and Inbox read as duplicates; paid-plan activation could wait
  on manual bank-proof approval with a dead-end waiting screen.
- **Fixed:** `/sell` is public and complete — how it works, six real
  features, **live pricing from `/public/plans`** (no drift from the actual
  plan table), add-ons, an honest FAQ (including "buyers never pay through
  CyberShop"), and a demo path ("See live stores first"). Header, mobile
  menu and footer all route vendors here instead of straight to a form.
- **Open (product decisions, not code):** (a) collapse Leads/Inbox naming in
  the dashboard or merge the nav items; (b) first-run dashboard should be
  "add first product → share link" with the other 14 sections progressive;
  (c) bank-proof waiting state needs an expected-time + WhatsApp-support
  escape hatch. All three are cheap; none were safe to guess at here.

### 2.5 Established vendor — S3

Well served before (CSV import, voice notes, variants, team, domains,
analytics export). Storefronts still cap at 96 items with no buyer-side
search on large catalogues — the first storefront gap to close when a
vendor actually hits it.

### 2.6 Admin / ops — S3

Eighteen sections, reconciliation, SLA'd moderation, 2FA, health alerts —
the most complete surface in the product. The critique is allocation, not
quality: **stop building here** until buyer traffic gives it something to
administer. One real gap: no funnel view (home → listing → WhatsApp click
by surface), which is the number the whole business now depends on.

### 2.7 Trust & safety — was S2, mostly fixed

- Badge soup resolved (§2.3). Jobs board demoted from the primary nav and
  now carries an explicit advance-fee/CV warning; it stays reachable from
  the footer and category filters.
- Deposits: user-facing copy was already honest ("CyberShop never holds
  the cash"); "escrow" survives only as an internal code name. Keep it
  that way — never let the internal word reach a buyer.
- **Open:** the platform owner's store is featured, entitled and was the
  hero of the old homepage's fake chat. That last part is fixed. On `/sell`
  it should appear as a labelled case study, and the marketplace should
  keep proving other sellers can win the top of the feed.

### 2.8 Growth / SEO — was S2, improved

- Homepage and category pages now server-render real listings, prices and
  sellers — indexable, unfurlable merchandise instead of a slogan.
  Categories target "Shop <Category>" with listing counts.
- City chips on the homepage link the (already existing) city filter;
  `/search` 308s into the shop instead of splitting equity across two
  result formats.
- **Open:** dedicated city landing content (`/listings?city=` has the
  title logic but no local copy), and filtered-URL canonicals still
  collapse to `/listings`, discarding long-tail category×city pages.
  Revisit once there is inventory worth indexing per combination.

### 2.9 Accessibility & performance — S2, partially open

- Kept the previous audits' wins (sticky header, closable menu, no
  scroll-hijack, focus-visible, 44px targets). New controls follow the
  same rules: save is a real `<button aria-pressed>` with a name; rating
  carries a text label; the save button is 44px on coarse pointers.
- Card/product imagery uses `loading="lazy" decoding="async"` everywhere;
  fixed aspect-ratio boxes (4:3) mean no layout shift while photos load.
- **Open (the honest big one):** there are still no responsive image
  variants — a card downloads the vendor's full-size photo. The media
  gateway should emit a ~640px card derivative and the API should return
  it as `image` + keep the original for the item page. And **nothing in
  this change has been seen in a real browser** (no Chromium exists in
  this sandbox) — §6 is not optional.

## 3. What was wrong / off (cross-cutting, consolidated)

1. **Homepage explained, never sold.** Zero products; API couldn't even
   return any. → Shop-first rewrite + listings in `/public/home`.
2. **A category was a directory, not an aisle.** → Listings first, stores
   second, real `pages` math (was hardcoded `pages: 1`).
3. **Two searches, five doors.** → One shop feed; `/search` permanent-
   redirects; Jobs out of the primary nav; nav is now Shop / Businesses /
   Sell + categories.
4. **Pricing hidden behind registration.** → Public `/public/plans` +
   `/sell`.
5. **Cards under-informative where trust is decided.** → Rating, recency,
   stock, negotiable, save, explained badges.
6. **Homepage N+1.** `publicBusiness()` fanned out ~7 queries × 12 stores.
   → Batched `businessCards()`/`marketCards()`: fixed-query-count reads.
7. **Vendor pitch and buyer shop fighting on one page.** → Each has its
   own page; the shop keeps only a slim vendor banner + header CTA.
8. **Fake social proof.** A scripted chat with the owner's academy posed
   as the product in action. → Gone. Real listings are the proof.

## 4. What is *not* in place (ranked backlog)

| # | Missing | Why it matters |
|---|---|---|
| 1 | Browser/device QA + 5-user test (§6) | Every layout claim so far is structural, not seen |
| 2 | Responsive image derivatives (gateway) | Cards ship full-size photos to cheap phones |
| 3 | Platform funnel analytics (home→item→WA) | The business metric; admin has errors, not demand |
| 4 | Dashboard first-run simplification | Vendor activation is the revenue funnel |
| 5 | City-shaped SSR feed + city landing copy | Local intent is how this market searches |
| 6 | Storefront search for big catalogues | First power-vendor ceiling |
| 7 | `prefers-reduced-data` motion kill-switch | Data cost is a UX issue in this market |

**Deliberately still not built:** checkout/escrow-by-default, native apps,
multi-currency. The reasoning in `gap-analysis.md` stands.

## 5. Galaxy Store rejection (UI/UX of the *listing*)

The rejection ("insufficient description/screenshots; screenshots blurred")
is the same disease as the old homepage: the listing described the concept
and showed decoration instead of functions. The fix kit lives in
`docs/galaxy-store.md` + `store-listing/`: paste-ready function-first copy,
an 8-shot storyboard mapped to real screens (the new shop homepage is shot
#1 — it finally *shows* shopping), native-resolution PNG capture rules
(blur = rescaled/compressed captures), an `adb` capture script, and a
stdlib screenshot validator. No fabricated screenshots are provided —
reviewers compare shots against the real app, and fake UI is how you earn
a second rejection.

## 6. Verification done — and the one that still needs a human

Done here: worker `tsc` clean; new `shop.test.ts` (home feed, category
aisle, public plans, card trust fields); web `tsc` clean, `next build`
clean, `jsx-nesting` audit clean, SSR curl sweep of `/`, `/sell`,
`/categories/:slug`, `/listings`, `/jobs`, `/search` (308) against seeded
demo data.

**Still owed (needs a browser + a Samsung):** the §4 visual pass from
`usability-audit.md` at 360×640 / 390×844 / 768×1024 / 1280×800 — in
particular that the first shop listing is visible without scrolling on
the smallest phone, the save button never overlaps card badges, and the
Galaxy screenshots in `docs/galaxy-store.md` are captured from the
current build.
