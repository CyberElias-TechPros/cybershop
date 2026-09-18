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

## 3. Not changed — recommended next (with reasons)

These are real gaps; each needs either a visual pass or a product decision, and this
sandbox has no browser to verify appearance in.

| # | Gap | Recommendation | Why it wasn't done here |
|---|---|---|---|
| R1 | `<button>` (add to cart) nested inside `<a class="card">` in `ItemCard`/`ListingCard` — invalid HTML; screen readers expose one or the other, and VoiceOver on iOS often cannot activate the inner control | Stretched-link pattern: card becomes a `div`, the anchor covers it via `::after`, the button is a sibling | Restructures three card components and their CSS; needs eyes on the result |
| R2 | `Fraunces.ttf` is 352KB and preloaded on every page; `icon-512.png` is 217KB | Convert to woff2 + latin-subset (≈ −60%), compress the icon, add a `maskable` icon for Android | Needs a font toolchain and a visual check of the display face |
| R3 | `globals.css` (80KB) + `cine.css` (44KB) ship to every route, including the dashboard | Split workbench-only CSS (dash/admin tables, onboarding, auth) into segment stylesheets | Large mechanical refactor; worth doing with a bundle budget in CI |
| R4 | Every public page is `force-dynamic` + `no-store`: one Worker round-trip per view, zero CDN cache | `unstable_cache`/ISR 30–60s for home, categories, businesses; SWR for listings — the single biggest TTFB win available | Product decision: how stale may the market be? |
| R5 | Search has no typeahead, no recent searches, no "did you mean"; a 1-character query silently asks for more | Suggestion endpoint + recent-search chips (localStorage) | New API surface |
| R6 | No visible affordance when `.main-nav` overflows | Edge fade/mask, or a "More categories" entry point | Cosmetic; the packing fix removed the overflow at common widths |
| R7 | `manifest.ts` exists but there is no service worker — a failed navigation on a flaky network shows the browser's own error page | Minimal offline shell + retry | PWA was scoped to P3 in `docs/feature-matrix.md` |
| R8 | The custom cursor removes native affordances (grab/pointer/text) and doubles pointer work | Consider dropping it; the hover ring already communicates state | Taste call for the art direction |
| R9 | The 404 page has no search field — a dead end for a mistyped URL | Add `SearchForm` + popular categories | Trivial, but changes a designed page |
| R10 | No `aria-live` feedback when filters/pagination replace a result list | Announce "N results" on change | Needs a decision on verbosity |
| R11 | Long legal pages (terms/privacy) have no in-page navigation | Sticky section index | Content/design work |
| R12 | Reel drag captures the pointer on `pointerdown` even when it starts on a card link | Capture after a small drag threshold | Behavioural tweak; current click-suppression already prevents accidental navigation |

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
