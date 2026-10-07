# CyberShop — usability & front-end gap audit

Date: 2026-09-18 · Scope: `web/` (Next.js 15 SSR front end) · Trigger: *"the phone
animation on the home page overshadows the menu and doesn't [let] viewers access
the app's content and click links until they scroll down"*, plus a request to look
for other gaps that would deter users.

**Method.** The stack was run locally (`scripts/bootstrap-dev.sh --seed`, Worker on
`:8787`, web on `:3000`) and every public route was rendered and inspected. Because
the sandbox has no Chromium (the browser download hosts are unreachable), findings
were established by **cascade analysis of the compiled stylesheet**, **inspection of
the server-rendered HTML**, and **instrumenting the local D1 database** — not by
eyeballing a rendered page. Two repeatable checkers were added so the CSS bug class
found here can be caught again:

```bash
# which declaration of a property actually wins, and why
node scripts/web-audit/css-cascade.mjs web/app/cine.css .site-header position

# responsive overrides that can never win (declared before the base rule) —
# exits 1 on a real conflict, so it can hang off CI
node scripts/web-audit/dead-overrides.mjs web/app/globals.css web/app/cine.css

# …or check what the browser really sees (stylesheets concatenated in link order)
H=http://localhost:3000
curl -s $H | grep -o '/_next/static/css/[^"?]*' | sort -u |
  while read -r c; do curl -s "$H$c"; echo; done > /tmp/app.css
node scripts/web-audit/dead-overrides.mjs /tmp/app.css
node scripts/web-audit/css-cascade.mjs /tmp/app.css .site-header z-index   # → 60
```

(`scripts/web-audit/css-walk.mjs` is the small scanner both share; it copes with
minified CSS, where the last declaration in a rule has no trailing `;`.)

Severity: **S1** blocks a visitor from using the site · **S2** costs conversions,
data quality or trust · **S3** polish / performance.

---

## 1. What was broken, and what changed

### S1 — the header was not sticky, so the menu disappeared on scroll

`app/cine.css` loaded *after* `app/globals.css` and re-declared the header inside a
group selector:

```css
main, .site-header, .site-footer { position: relative; z-index: 1; }   /* cine.css */
```

That has the same specificity as `.site-header { position: sticky; top: 0; z-index: 50 }`
in `globals.css`, and the later file wins — so **the header was `position: relative`
at `z-index: 1`**. The whole nav (brand, Listings/Jobs/Businesses, categories,
search, Saved, Sign in, Sell) scrolled off the top of the screen and stayed gone:
the only way back to navigation was to scroll all the way up. `html.hdr-scrolled`
(the condensing-header effect) and `.cine-hero { min-height: calc(100vh - 64px) }`
both assumed a sticky 64px header, which confirms the intent.

*Fix* — `app/cine.css`: the group selector now covers `main`/`.site-footer` only,
and the header is re-declared as sticky at `z-index: 60` (above the mobile menu at
48, below the modal overlays at 70–300). Anchor targets get `scroll-margin-top: 84px`
so `#market` ("Enter the market") and the skip link no longer land under the bar.

### S1 — the mobile menu was a trap: it could not be closed

The burger lives in the header. With the header flattened to `z-index: 1`, the
full-screen overlay `.cine-menu` (`position: fixed; inset: 0; z-index: 48`) painted
**over the header**, so the button that opens the menu could not be used to close
it — and `html.menu-open { overflow: hidden }` had already locked page scroll. The
only escape was tapping a destination.

Worse, the overlay could not scroll: `display: grid; place-items: center` with 13
links at up to `3rem` overflows a 640px-tall phone, so the last links were clipped
and unreachable behind the scroll lock.

There was also no `Escape` handling, no focus containment (Tab walked into the page
behind the overlay), no focus restore, no `aria-controls`, and the menu was a
*subset* of the site: no **Jobs**, no **cart** — while being the only navigation a
phone user has.

*Fix* — `components/HeaderCta.tsx`, `app/cine.css`, new `lib/useDialogFocus.ts`:

- header above the overlay (z 60 > 48) plus an explicit **"Close ✕"** button inside it;
- `Escape` closes, focus moves in on open, `Tab` is contained, focus returns to the burger;
- the overlay scrolls (`overflow-y: auto`, `overscroll-behavior: contain`), type tightens
  under 720px viewport height, safe-area padding top and bottom;
- `role="dialog" aria-modal aria-label` + `aria-controls` on the burger;
- menu closes itself when the viewport grows into the desktop nav (no stranded lock);
- link parity with the desktop nav + footer (Listings, Businesses, Jobs, categories,
  Search, Saved, WhatsApp cart, Sell, Sign in).

The same `useDialogFocus` hook now backs the **cart drawer**, which had `Escape` but
no focus containment, no focus restore and no scroll lock.

### S1 — the reported issue: the phone stage owned the first screen on mobile

Three separate things combined:

1. `@media (max-width: 960px) { .phone-stage { order: -1 } }` moved the decorative
   WhatsApp phone **above** the headline, the search field, the category links and
   the stats — the reverse of the app's own convention (`AuthShell` puts the form
   first on mobile with `order: -1`).
2. `.phone-stage { height: 560px }` is a *layout* height, and `transform: scale(0.88)`
   does not shrink layout — so the decoration occupied ~540px of a 640–844px viewport
   before any content began. The mobile override could not win anyway: it was declared
   *before* the base rule (`css-cascade.mjs` shows exactly this class of bug).
3. `.cine-hero { min-height: calc(100vh - 64px) }` — `100vh` on mobile browsers
   includes the collapsed URL bar, so the hero was always taller than the visible area.

Net effect: a first-time visitor on a phone saw an animated phone, nothing tappable,
and had to scroll two screens to reach the aisles.

*Fix* — `app/cine.css`, `app/page.tsx`:

- copy first, always (`.cine-hero-copy { order: 1 }`, stage `order: 2`);
- the compact-stage overrides are declared **after** the base rules so they win:
  stage `height: auto`, phone `min(252px, 70vw) × min(400px, 52vh)`, smaller bubbles,
  orbit chips pulled in (`inset: 2% -2%`) so nothing bleeds horizontally;
- in landscape (`max-height: 540px`) the stage is removed entirely;
- `min-height: calc(100svh - 64px)` (with the `100vh` line kept as the fallback);
- **hero CTA row added** — "Browse businesses" / "See latest listings" now sit next
  to the search field, so there is an obvious way in for visitors who are not
  searching for something specific. Verified DOM order in the SSR HTML:
  `hero-search → hero-cta → phone-stage → scroll cue`;
- the hero's entrance stagger was cut from ~1.6s to ~0.48s (the search field and
  category links are the hero's only doors; they were fading in last).

### S1 — the intro curtain swallowed every click for ~2.2 seconds

`.cine-intro` is `position: fixed; inset: 0; z-index: 300` and had **no
`pointer-events: none`**, with `animation: intro-out 0.7s … 1.5s forwards`. Every
tap and click on the page — nav, search, categories, CTAs — was absorbed by an
invisible-but-present overlay for the first 1.5–2.2s after load, i.e. exactly when a
returning visitor clicks fastest.

It was also mounted from a React effect, so on a real connection the sequence was:
page paints → hydration → **black curtain drops over readable content** → fades.

*Fix* — `app/cine.css`, `app/layout.tsx`, `components/Atmosphere.tsx`: the curtain
is now **server-rendered** (it covers the first paint instead of interrupting it),
`pointer-events: none`, gone by ~1.2s, retired immediately on the first
`pointerdown`/`keydown`/`wheel`, still once-per-session (the decision moved into the
pre-paint boot script, which also skips it on `/dashboard` and `/admin`).

### S1 — the featured reel hijacked vertical scrolling

`BusinessReel` converted the page's downward wheel scroll into sideways reel
movement and called `preventDefault()` until the reel hit its end. On the home page
that means: scroll to see the market → the page freezes and a carousel slides
instead. It also had no `touch-action`, so touch drags fought the browser's own
scrolling, and no affordance that the list scrolls horizontally (scrollbar hidden).

*Fix* — `components/Cinema.tsx`, `app/cine.css`: wheel hijack removed (trackpads and
shift-wheel scroll an `overflow-x: auto` element natively), `touch-action: pan-y`
so vertical page scrolling always wins, drag kept with click-suppression, plus
**← / → controls and a "drag or scroll sideways" hint** that appear only when the
reel actually overflows and disable at the ends.

### S2 — every storefront and item view was counted twice

`generateMetadata()` and the page component each called `api()` for the same
document, and the Worker records `storefront_view` / `item_view` on every hit — so
vendor analytics were inflated 2× and each page view cost two Worker round-trips.
Measured against the local D1 (`analytics_events`): **one** page load added **two**
events before the fix, **one** after.

*Fix* — `lib/api.ts`: GETs are deduplicated per render pass with React `cache()`,
and the caller IP is resolved inside `api()` when not supplied, so the metadata call
and the page call share a cache key. No call sites needed changing.

### S2 — an API outage was presented as an empty market

The home page caught Worker errors and rendered the "cinematic empty market":
`0 active businesses`, `0 industries`, *"The stalls are being set — categories
arrive with the first vendors"*, *"No stalls yet — be the first lantern"*. During a
transient outage that tells a prospective vendor the platform is dead.

*Fix* — `app/page.tsx`, `app/cine.css`: the page distinguishes *offline* from
*empty*. Counters are suppressed and a calm status line with a reload path is shown
instead; the two empty states have their own outage copy.

### S2 — no error boundary and no pending state anywhere

There was no `error.tsx`, `global-error.tsx` or `loading.tsx` in the whole app. Any
Worker 5xx on a server-rendered page surfaced Next's bare *"Application error: a
client-side exception has occurred"* with no way forward, and slow routes gave no
feedback at all (a "dead tap" on mobile networks).

*Fix*:

- `app/error.tsx` — branded, with **Try again** (`reset()`), home and browse links,
  and the error digest for support;
- `app/global-error.tsx` — self-contained inline styles (the root stylesheet is not
  guaranteed to be present there);
- `app/dashboard/loading.tsx`, `app/admin/loading.tsx` — filament + skeleton +
  `role="status"`.

Deliberately **not** a root `loading.tsx`: a root boundary wraps the public SEO
surfaces in Suspense and streams the skeleton first — the exact thing
`app/listings/page.tsx` documents avoiding ("render the full feed inline so non-JS
crawlers — WhatsApp, social unfurlers — see the market"). Verified in the SSR HTML:
`/` and `/listings` contain no skeleton, `/dashboard` does.

### S2 — the header was over-packed between 981px and 1279px

Brand + 8 nav links + a 240px search field + three CTAs do not fit a 981–1279px
viewport. `.main-nav` is `overflow-x: auto` with the scrollbar hidden, so category
links silently disappeared with no hint that the nav scrolled.

*Fix* — `components/Header.tsx`, `app/cine.css`, `app/globals.css`: the nav keeps
the three market links + the top 3 categories; below 1280px the text search collapses
into a **44px search icon button** (new — previously phones had no header search at
all) and Saved/Sign in move behind the burger; the "Sell on CyberShop" CTA stays
visible at every width. Nothing is clipped at any breakpoint now.

### S2 — the gallery could not be used without a mouse

`components/Gallery.tsx` rendered thumbnails as `<img onClick={…}>`: not focusable,
not announced, not operable by keyboard or screen reader. Now real `<button>`s with
`Show photo N of M` labels and `aria-current`, styled identically.

### S2 — the sticky WhatsApp bar was focusable while invisible

`.sticky-wa` slides up from `translateY(110%)` and is `aria-hidden` until visible,
but it stayed in the tab order — keyboard users tabbed into an off-screen "Chat now"
(WCAG 4.1.2: hidden from AT but focusable). Now `visibility: hidden` until shown.

### S3 — performance on the devices this market actually uses

- **Particle field**: a full-screen canvas repainted every frame with an O(n²) link
  pass (up to 92 particles ≈ 4 200 pair tests/frame) ran on *every* phone, where
  there is no cursor for it to follow. Now gated (fine pointer, ≥720px, not
  data-saver/2G, ≥2GB device memory), capped at 72 particles, throttled to ~30fps,
  link pass only under 56 particles, and paused when the tab is hidden
  (`components/Atmosphere.tsx`).
- **Tilt effect** read `getBoundingClientRect()` on every `touchmove` — a forced
  layout mid-scroll on phones. The rect is now cached per card and invalidated on
  scroll/resize (`components/Fx.tsx`).
- **Reveal blur**: `filter: blur(4px)` animated on every card is the most expensive
  part of the reveal; dropped on coarse pointers, keeping the fade + rise
  (`app/globals.css`).
- **CSS nesting accident**: `.page-veil` and its keyframes were nested *inside* the
  `:root` declaration block. Next's default PostCSS preset (`postcss-preset-env`,
  stage 3) does not compile nesting away, so browsers without native CSS nesting
  dropped the page-transition rules. Hoisted to top level; `dead-overrides.mjs`'s
  sibling check (`css-cascade.mjs` plus a nesting scan) now reports 0 nested rules.

### S3 — remaining interaction polish that was fixed

- **Custom cursor risk**: `html.cine-cursor * { cursor: none !important }` was applied
  before the replacement cursor existed — if the effect failed the visitor had no
  cursor at all. The class is now added only once the ring is on screen and tracking.
- **Skip link**: `#main` is now `tabindex="-1"` (focus actually moves) with no
  document-wide outline.
- **`<div aria-label>`** for the hero's popular categories → `<nav aria-label>` (a
  label on a generic container is not exposed to AT).
- **Marquee**: hover-pause existed for mouse users; on touch there is no way to pause
  auto-moving content (WCAG 2.2.2), so the strip is static on coarse pointers.
- **Touch targets**: nav links (~32px), header links, hero chips, footer links and the
  copy-email button now meet 44px on coarse pointers.
- **Footer buried by floating furniture**: the sticky WhatsApp bar (≤900px) and the
  cart chip permanently covered the footer's last row. Both now set a body class
  (`wa-bar-on`, `cart-chip-on`) and the footer gains clearance.
- **WhatsApp blackout** after the slide-to-chat gesture held the screen for 2.6s; now
  1.8s and lifted as soon as the page becomes visible again (i.e. WhatsApp took over).
- **Search field** gets `enterkeyhint="search"` so the mobile keyboard offers the
  right action key.
- **Form focus indicators**: `.input:focus` / `.search-form input:focus` set
  `outline: none` and relied on a low-contrast border/glow shift. A real
  `:focus-visible` outline is restored for all form fields (declared last so it wins).

---

## 2. Verified

- `web`: `npx tsc --noEmit` clean, `next build` clean (all 50+ routes).
- All public routes render 200 and `/nope-404` renders the 404 page; no
  "Application error" markers in any SSR HTML.
- Compiled stylesheet checked declaration-by-declaration for the selectors that
  matter (`.site-header` position/z-index, `.cine-menu` z-index, `.cine-intro`
  pointer-events, `.phone-stage`/`.phone` mobile sizing, `.hdr-*` display per
  breakpoint) — every override now wins its cascade.
- `analytics_events` before/after a single storefront load: 2 events → 1.
- SSR HTML: hero order (`hero-search → hero-cta → phone-stage`), curtain present in
  the first HTML, menu with 13 links + close button + `role="dialog"`,
  `main[tabindex="-1"]`, no skeleton on public pages.

## 3. Recommended next — status

Originally a list of gaps with reasons for deferring each one. Most are now
closed, so this is a status table; the ones that are not explain why.

| # | Gap | Recommendation | Status |
|---|---|---|---|
| R1 | `<button>` nested inside `<a class="card">` in `ItemCard`/`ListingCard` — invalid HTML, and VoiceOver on iOS often cannot reach the inner control | Stretched-link pattern | **Done.** Cards are no longer nested. `scripts/web-audit/jsx-nesting.mjs` scans every page and component and fails CI on any interactive element inside another; 158 files clean |
| R2 | `Fraunces.ttf` is 352KB and preloaded on every page; `icon-512.png` is 217KB | woff2 + subset; compress the icon; add a maskable icon | **Done.** Font 352KB → 104KB by keeping the `wght` and `opsz` axes and pinning `SOFT`/`WONK` to the values they already sat at — no visual change. Glyph coverage was left whole (subsetting saved 1.4KB and dropped the minus sign). Icons 240KB → 95KB at PSNR 44dB. A maskable icon was already declared in `app/manifest.ts` |
| R3 | CSS (125KB raw, 27KB gzip) ships to every route including the dashboard | Split workbench-only CSS into segment stylesheets | **Budget only — the split is not safe here.** See the note below |
| R4 | Every public page is `force-dynamic`: one Worker round-trip per view, no reuse | Cache the browse surfaces | **Done.** Home, the market feed, the directory and category pages reuse an upstream response for 60s (300s for taxonomies) — but only for anonymous visitors. See the note below |
| R5 | Search has no typeahead, no recent searches, no "did you mean" | Suggestion endpoint + recent-search chips | **Was already done.** `components/SearchForm.tsx` has debounced typeahead against `/api/public/suggest` and recent searches in `localStorage` |
| R6 | No visible affordance when `.main-nav` overflows | Edge fade, or a "More categories" entry point | **Done.** A mask fades the right edge, with `scroll-padding-inline: 28px` so a keyboard-focused link never lands inside the faded band |
| R7 | `manifest.ts` exists but there is no service worker, so a failed navigation shows the browser's error page | Minimal offline shell | **Was already done.** `public/sw.js` serves `public/offline.html` on a failed navigation; registered in production only by `components/OfflineSW.tsx` |
| R8 | The custom cursor removes native affordances (grab/pointer/text) | Drop it, or restore the native cursors | **Done.** The ring stays as atmosphere; links, buttons, switches and selects get `pointer`, the reel gets `grab`/`grabbing`, disabled controls get `not-allowed` |
| R9 | The 404 page has no search field — a dead end for a mistyped URL | Add a search field | **Was already done.** `app/not-found.tsx` renders `<SearchForm big />` |
| R10 | No `aria-live` feedback when filters or pagination replace a result list | Announce "N results" on change | **Done.** `components/ResponsiveTables.tsx` watches each workbench table's row count and announces it politely; the visible counts that change under the user's fingers carry `role="status"` |
| R11 | Long legal pages have no in-page navigation | Sticky section index | **Done.** `components/PageNav.tsx` — a server-rendered contents list on terms, privacy and safety, labels read from the `<h2>` elements they link to |
| R12 | Reel drag captures the pointer on `pointerdown`, even when it starts on a card link | Capture after a small drag threshold | **Done.** Capture is deferred until the pointer has moved 6px, so a tap is left to the browser and opens the card |

### R3 — why the CSS is not split

The budget is in place (`scripts/web-audit/css-budget.mjs`, wired into CI, 32KB
gzip per route against 26.9KB today), but the split itself is not, because the
mechanism does not work in this app.

Importing a stylesheet from a nested layout or page does not drop it into that
route — Next builds the chunk, lists it in `app-build-manifest.json`, and then
never emits the `<link>`. The styles are silently absent. Verified on a static
route (`/safety`) and a dynamic one (`/admin`), with a probe rule that ended up
in its own 31-byte file, referenced by the manifest, and loaded by nothing.

So moving the workbench rules out of `design-system.css` would have shipped a
dashboard with no styles and no error anywhere. The finding is recorded here so
nobody tries it again without re-testing.

What that leaves: the dashboard really does load 27KB of CSS it barely uses,
and the only safe lever on that number today is deleting or tightening rules
rather than moving them. The CI budget stops it growing.

### R4 — why only anonymous visitors are cached

The public endpoints run a block filter that reads the session and removes any
business the signed-in visitor has blocked. Caching a page built from that
response is not merely a leak of one visitor's block list — it shows a blocked
seller back to the person who blocked them. On a marketplace where people block
for harassment, that is the one failure this platform cannot have.

So `api()` refuses to cache any request carrying a session cookie. Signed-in
visitors always hit the Worker and always get their own view; anonymous
visitors, who are most of the traffic on a public market, stop waiting on the
upstream entirely. Measured: three signed-in views of `/` write zero cache
entries, five anonymous views write one and reuse it four times.

Search is untouched and stays live, as do the storefront and item pages — those
two record `storefront_view` and `item_view`, and caching them would quietly
deflate every vendor's analytics.

## 4. Suggested verification pass (needs a browser)

The fixes here are structural and were verified against the compiled CSS and SSR
HTML. Before shipping, run one visual pass at 360×640, 390×844, 768×1024,
1024×768, 1280×800 and 1440×900:

1. Home: is the search field + at least one CTA above the fold on the *smallest*
   phone, with the phone stage below the copy?
2. Scroll: does the header stay, condense, and does "Enter the market" land clear of it?
3. Burger: open → Close ✕ / burger / `Escape` all work; the list is fully reachable
   on a 640px-tall screen; focus returns to the burger.
4. Reel: vertical wheel scroll moves the page, not the reel; arrows and drag work.
5. Item page: thumbnails operable by keyboard only; slide-to-chat still opens WhatsApp;
   the blackout lifts on return.
6. Lighthouse mobile on `/` and on one item page (expect the biggest deltas from the
   particle field, the reveal blur and the hero stagger).

---

## 5. Round 2 — October 2026 (responsive gaps, store photos, trust, navigation)

Date: 2026-10-06 · Scope: `web/` + `worker/` · Trigger: four reports from the
operator — *"courses from the old flyer are stale"*, *"stores have no profile
photo"*, *"tapping Dashboard shows 'the market is not available' until you press
Try again"*, and *"check the mobile/tablet/desktop layout — I want everything
reachable and a smoother UI/UX"*, plus a request for site-wide anti-scam
disclaimers.

**Method.** Same as round 1 (no Chromium in the sandbox): the stack was run
locally, every route was rendered and inspected, and the CSS was verified with
`scripts/web-audit/dead-overrides.mjs` (overrides that can never win) and
`css-cascade.mjs` (which declaration actually wins). The Worker suite
(`npm test`, 56 tests) and `next build` were run before and after.

### 5.1 The catalogue — 13 current Cyber Elias Academy courses

`scripts/seed-demo.sh` carried ten courses transcribed from an older CEA flyer
(₦15k–₦30k, including WordPress and Python). The academy now publishes **13
core short courses** with different fees and durations, so the seed was
rewritten against the current course list and made convergent:

| # | Course | Fee | Duration | Sessions | Level |
|---|---|---|---|---|---|
| 1 | Microsoft Office | ₦30,000 | 3 weeks | 6 · 2/week | Absolute beginner |
| 2 | Typing & Computer Basics | ₦20,000 | 2 weeks | 4 · 2/week | Absolute beginner |
| 3 | Graphic Design | ₦40,000 | 4 weeks | 8 · 2/week | Beginner |
| 4 | Web Design | ₦50,000 | 4 weeks | 8 · 2/week | Beginner |
| 5 | Digital Marketing | ₦40,000 | 4 weeks | 8 · 2/week | Beginner |
| 6 | Social Media Management | ₦30,000 | 3 weeks | 6 · 2/week | Beginner |
| 7 | Data Entry | ₦20,000 | 2 weeks | 4 · 2/week | Beginner |
| 8 | Computer Repairs | ₦50,000 | 4 weeks | 8 · 2/week | Beginner |
| 9 | Web Development | ₦60,000 | 6 weeks | 12 · 2/week | Beginner |
| 10 | Cybersecurity | ₦50,000 | 4 weeks | 8 · 2/week | Beginner |
| 11 | Business & Freelancing | ₦30,000 | 3 weeks | 6 · 2/week | Beginner |
| 12 | Content Creation | ₦30,000 | 3 weeks | 6 · 2/week | Beginner |
| 13 | Online Teaching | ₦30,000 | 3 weeks | 6 · 2/week | Beginner |

- **Idempotent upsert.** The script now lists the vendor's existing items and
  `PUT`s a course that already exists (matching on slug) instead of `POST`ing
  it, and `DELETE`s anything the academy no longer runs (WordPress, Python). A
  store seeded from the old flyer therefore converges on the current 13 instead
  of failing on duplicate slugs — and re-running is a no-op.
- **Plan headroom.** The free plan caps a catalogue at 10 items, so the demo
  store is moved to Starter the honest way (intent → bank proof → admin
  approval) rather than by lowering the quota. Skipped when the store already
  has room (`GET /vendor/business` → `quotas.max_listings`).
- **Richer course fields.** Migration `0009` adds `sessions` and
  *What you will produce* (`outcome`) to the academy field schema and
  *Absolute beginner* to the level options, so the spec table on a course page
  carries duration, sessions, level, mode, certificate, instructor, outcome and
  curriculum — instead of cramming them into the description.
- **SEO pair per course.** `seo_title` / `seo_description` are seeded per
  course ("Microsoft Office Course in Port Harcourt | Cyber Elias Academy").
- **Course-specific WhatsApp ask** (migration `0009`): the course template now
  names the course, its fee and duration and asks the two questions every
  prospective student asks first — *next available start date* and *how to
  enrol*. Two new template variables, `{{item_type}}` and `{{item_type_lc}}`,
  let it read as natural English ("the Data Entry course listed on CyberShop"),
  which is also what tells the merchant which listing produced the chat.

### 5.2 Store profile photos

The data model always had `businesses.logo_media_id` / `cover_media_id` and the
storefront already rendered a logo — but **no screen in the product could set
one**, so every store showed initials. Added:

- `components/BrandMedia.tsx` — a picker that uploads a new image (either
  storage driver, through the shared `lib/uploads.ts` helper now used by the
  media library too) or picks one already in the library, with a live preview
  and a Remove action (`POST /vendor/business/media` now accepts
  `media_id: null` to clear a field).
- Dashboard → **Settings → Store photos** is the first card on the page.
- The store's face now travels with it: `GET /public/market/listings` returns
  `biz_logo` and `ListingCard` renders a small avatar next to the seller name
  on every market card.

### 5.3 Trust & safety — verify before you pay

CyberShop is an introduction, not a shop, and it is free — which is exactly why
the disclaimer has to be structural rather than a line in the footer. Added:

- **Site-wide ribbon** (`components/SafetyRibbon*`) on every page, above the
  header: server-rendered (present without JS), dismissible for a week, with a
  pre-paint script that hides it for snoozing visitors so it never flashes.
- **Pre-enquiry reminder** inside the WhatsApp card, directly above the button
  that hands the buyer to a stranger (storefront + item page).
- **Rewritten `/safety`**: three beats of a safe deal (talk → verify → pay),
  *what CyberShop never does*, red flags, what to do when it goes wrong, and
  the vendor's side.
- **Terms** now lead with the same disclaimer and state plainly that there is
  no buyer protection because there is no checkout.
- **Admin-editable copy**: `platform_settings.safety` (headline, notice, tips,
  enabled), exposed in **Admin → Settings → Trust & safety notice**, parsed
  tolerantly by the Worker and defaulted in `web/lib/safety.ts` so a catalogue
  outage can never strip the notice from a page.

### 5.4 "Market is not available" on the first tap

Symptom: from the home tab, tapping Dashboard showed an error screen
("The market flickered" / "We could not load the market") and worked after
pressing **Try again**. Cause: the first request of a cold serverless
invocation races the Worker's cold start; that race fails as a network error or
a 5xx, and every dashboard route is `force-dynamic`, so the failure surfaced as
a route error instead of a slow load. Three fixes:

1. **Retry inside the request** (`web/lib/api.ts`): 3 attempts with an 8s
   per-attempt timeout (`WORKER_TIMEOUT_MS`), retrying network errors, 408/429
   and 5xx. The visitor never sees the race.
2. **The error boundary retries once by itself** (`app/error.tsx`), showing
   "Reconnecting…" and pressing Try again for the visitor — guarded per path
   (20s window) so a genuinely broken page cannot loop.
3. **Instant navigation feedback** (`components/RouteProgress.tsx`): a top
   progress bar started on the *click* (not on the pathname change, which only
   fires after the server work is done) so a slow route never reads as a dead
   tap.

### 5.5 Responsive gaps closed

| Gap | Where | Fix |
|---|---|---|
| 5- and 6-column inline `grid-template-columns` overflowed the phone viewport | `admin/settings` (bank rows), `admin/categories` (field rows) | `.row-grid-2/3/4` — 1 column ≤560px, 2 ≤900px |
| `.data-table` had no scroll container: the last columns were clipped by `.card { overflow: hidden }` and unreachable | `admin/users` | `.table-scroll` wrapper + `min-width` |
| 15 dashboard links in a one-line horizontal scroller — most of the workbench was invisible | `DashNav` | Phone nav becomes wrapping chips: the 5 primary sections always visible, "More" reveals the rest (and flags when the current page is behind it) |
| Item spec rows squeezed long values into a right-aligned sliver | `.field-row` | Stacks to label-above-value ≤620px |
| Long values (URLs, hashes) stretched cards | global | `overflow-wrap: break-word` on `body`, `min-width: 0` on card/panel/grid children |
| Stray wide children dragged the page sideways | global | `html { overflow-x: clip }` (safe for `position: sticky`, unlike `overflow-x: hidden`) |
| Anchors landed under the sticky header | global | `html { scroll-padding-top }` from the new `--header-h` token |
| Menu close button sat under the header, where it could not be tapped | `.cine-menu-close` | Moved below the header band |
| Data tables scrolled with no affordance | `.table-wrap` | Edge fades (local background attachment) + sticky headers |

### 5.6 The design system pass (`web/app/design-system.css`)

Loaded after `globals.css` + `cine.css` and organised as: tokens → base →
header → controls → cards/grids → tables → workbench shell → trust → store
photos → navigation feedback → sticky offsets → reduced motion. It introduces
one ruler for the whole product — space (`--s-1…--s-20`), type (`--fs-*`),
radius (`--r-*`), elevation (`--elev-1…3`), layout (`--maxw`, `--gutter`,
`--header-h`, `--section-y`) and controls (`--ctl-h`) — and then rebuilds the
surfaces that mixed ad-hoc values: button/input heights (44px targets on touch),
card radius and shadow, section rhythm, tabular grids, and the sticky offsets
that used magic pixel numbers.

Verified with the round-1 checkers: `dead-overrides.mjs` reports no losing
override (the one remaining hit is an identical value), and `css-cascade.mjs`
confirms the intended winners. `tsc --noEmit` clean, `next build` clean,
Worker suite 56/56.

### 5.7 — closed

- **R1 nesting** — closed, and guarded against coming back by
  `scripts/web-audit/jsx-nesting.mjs` in CI.
- **Admin tables below ~640px** — closed. Below 560px of content width a row
  becomes a stacked record card with its column heading beside each value; the
  headings are copied off the table's own `<th>` elements at runtime by
  `components/ResponsiveTables.tsx`, so adding a column cannot desynchronise
  them. Between 560px and 700px the first column is pinned instead. Both are
  *container* queries keyed to `.dash-main`, because at a 900px viewport the
  248px sidebar leaves the content only ~590px wide and a viewport breakpoint
  would have sat still while the table overflowed.
- **The workbench nav on a tablet (861–1024px)** — kept as a sidebar. At 1024px
  the sidebar still leaves ~712px of content, which is fine; the problem band
  was 861–950px, and that is what the container queries above fix. Switching to
  the chip treatment at that width would have spent a lot of vertical space on
  fifteen destinations to solve a problem that was really about table width.

