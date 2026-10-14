# Responsive audit — smallest to largest screen (2026-10-14)

Method: full inventory of every breakpoint across the three stylesheets
(`globals.css` → `cine.css` → `design-system.css`, in load order), the
shared audit scripts (`scripts/web-audit/`), and SSR markup checks at the
route level. There is no browser in the sandbox, so layout claims are
verified by cascade analysis (`dead-overrides.mjs` — every responsive rule
in this pass actually wins) rather than screenshots; render on a real
device before calling any tier pixel-final.

## The breakpoint scale (now consolidated)

| Tier | Range | What happens |
| --- | --- | --- |
| Tiny | ≤359px (Galaxy Fold folded, older small phones) | Product/category grids drop to one honest column; brand shrinks; header tightens; theme picker one-up |
| Phones | ≤560px | Two-up product grid (was: one column under ~460px), compact cards, shop filters stack (search spans the row), section heads stack, cine menu links shrink |
| Small phones/tablets | ≤640px | Store hero compresses |
| Dash shell | ≤860px | Workbench nav becomes wrapping chips; group headings hidden, wrappers dissolve (`display: contents`) |
| Phone nav | ≤980px | Header links collapse into the full-screen grouped menu |
| Small laptops | 981–1279px | Grouped nav fits: Shop · Businesses · **Categories ▾** · search icon; burger removed (was: nav visible but links hidden) |
| Desktop | 1280–1599px | Full nav, inline search |
| Wide | ≥1600px | `--maxw` 1200→1360px (grids gain columns instead of margins) |
| Ultrawide | ≥2200px | `--maxw` 1560px |

Plus a global rule: `overflow-x: clip` on html/body — auroras and reels
can never push the page sideways again.

## Grouping (the other half of the request)

- **Navbar** — was flat: Shop · Businesses · Sell · first 3 categories,
  horizontally scrolling, with "Sell" duplicated in the gold CTA.
  Now: **Shop · Businesses · Categories ▾** (new `CategoriesMenu`
  dropdown: every category with its icon, Escape/outside-click/route
  close, `aria-expanded`, current state). Sell's nav link removed — the
  gold CTA is the single sell entry.
- **Mobile menu** — was 15 flat links with numbered markers. Now three
  headed groups: **Shop** (Shop all, Businesses, Saved, WhatsApp cart),
  **Categories** (every category, with icons), **Sell & account** (Sell
  on CyberShop + role-aware Dashboard/Account/Admin or sign-up links).
- **Dashboard/admin nav** (`DashNav`) — 17–18 flat links are now grouped:
  vendor **Today / Selling / Customers / Store / Account**, admin
  **Today / Moderation / Money / System**. On phones the grouping
  visually dissolves so the existing chip + More behaviour is unchanged.
- **Footer** — gained a real **Categories** group (top 6 + Shop all),
  rebalanced to 5/3/2/1 columns across the tiers.

## Pre-existing scatter this pass had to work around

Three stylesheets define competing base rules for the same components
(`--maxw` was 1120px in globals, 1200px in design-system; grids defined
twice). The cascade audit caught 9 rules from the first draft of this
pass losing to later files — they were moved into the file that actually
wins instead of being left as dead CSS. End state: `dead-overrides.mjs`
reports only one pre-existing harmless same-value note.

## Verified

- `tsc --noEmit` clean (web + worker), production build passes,
  `jsx-nesting` clean (164 files), theme unit tests 6/6 still green.
- SSR: header renders the Categories dropdown button; mobile menu
  renders its 3 groups; footer renders 6 category links; vendor
  dashboard renders all 5 group headings, admin all 4.

## Caveats

- No browser in the sandbox: widths above are cascade-verified, not
  screenshot-verified. Check 280px, 360px, 768px, 1280px and a 2560px
  monitor on real hardware once.
- The dropdown's keyboard story is solid (Escape to close, `aria-expanded`),
  but a full focus trap inside the open panel is future work.
