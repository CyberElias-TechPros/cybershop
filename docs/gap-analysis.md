# What's missing — a full audit, and what to do about it

**Question asked:** what does CyberShop still need, in every area, so it works
completely and gives every kind of user what they came for — and can it be made
production ready so that going live is only a matter of adding keys?

**Short answer:** the product surface is unusually complete for something this
young — buyer accounts, vendor subscriptions, Paystack, moderation, reviews,
leads, deposits, team accounts, custom domains, analytics, cron. What was
missing was **entitlement** (the owner's own store paying for its own
platform), **money safety** (an unsigned payment webhook), and the whole
**operational layer** that turns working code into a live business: config
self-checks, security headers, a runbook, backups, share cards.

Everything in "Fixed in this change" below is done and tested — nine items,
including the two that were blocking a live launch. The "Next" section is what I
would build after this, in the order I would build it.

---

## How this was audited

Read the whole of `worker/src` and `web/`, then traced each user story end to
end against the code: register → pay → publish → be found → be contacted →
convert → renew → expire. Ran the worker suite (56 → 65 tests), `tsc --noEmit`,
`next build`, and curl sweeps of every route.

**Limits you should know about.** There is no browser in this environment
(Chromium cannot be installed), so nothing here was verified visually. Layout
claims come from reading CSS and the DOM that the server returns, not from
looking at a rendered page. Two consequences: the responsive findings in
`usability-audit.md` still need a human with a phone, and the new share cards
have been confirmed to be valid 1200×630 PNGs but nobody has *looked* at one.

---

## Scorecard: what the app already does

Worth writing down, because "what's missing" is only meaningful against it.

| Area | State |
|---|---|
| Buyer: register, verify email, save listings and searches, alerts, enquiries, reviews, block a seller | ✅ complete |
| Buyer privacy: data export, account closure | ✅ complete (Account → Settings) |
| Vendor: onboarding, plans, Paystack + bank transfer, approval | ✅ complete |
| Vendor: catalogue CRUD, photos, voice notes, CSV import, variants, scheduling | ✅ complete |
| Vendor: leads pipeline, follow-ups, inbox, WhatsApp routing | ✅ complete |
| Vendor: team/staff, custom domain, verification, offers, templates | ✅ complete |
| Reviews: only from people who actually enquired — one per buyer | ✅ complete and unusually well guarded |
| Admin: payments, vendors, verifications, reports, listings, categories, plans, audit log | ✅ complete |
| Trust & safety: ribbon, per-CTA reminder, `/safety`, terms, reports, blocks | ✅ complete |
| Dependent flows: expiry → grace → suspension, scheduled publishing, saved-search alerts, analytics rollup | ✅ complete (hourly cron) |
| SEO: per-item SEO fields, JSON-LD, sitemap, robots, composed share cards | ✅ complete |
| Analytics: totals, trend, per-listing conversion, best hour — vendor-facing | ✅ complete (added in this change) |

---

## Fixed in this change

### 1. Cyber Elias Academy was paying for its own platform — **P0**

CyberShop belongs to Cyber Elias Academy. CEA's store was on the same paid
ladder as everybody else, and because the free plan caps a catalogue at 10
items, its own 13 courses didn't even fit without buying Starter.

There is now a real entitlement, not a seeded shortcut
(`worker/src/lib/entitlement.ts`, migration `0010`):

- `businesses.plan_override` is the source of truth; quotas read it first.
- A `subscriptions` row with `expires_at = NULL` is kept in sync, so every
  existing screen sees Enterprise without special-casing.
- The hourly cron re-asserts the entitlement before anything else; every expiry
  sweep skips `expires_at IS NULL` **and** `plan_override IS NOT NULL`, so the
  store cannot be expired, suspended or downgraded — even by an admin.
- It is auto-verified and featured, and its billing screen says "on the house"
  instead of showing a renewal date and a Pay Now button.
- **Admin → Vendors → Grant plan** extends the same to any store. A reason is
  required and goes in the audit log. Revoking gives 30 days' notice.

Six integration tests pin it (`worker/src/tests/entitlement.test.ts`), including
one that proves the 13-course catalogue fits and one that survives the cron.

### 2. The Paystack webhook was not signature-verified — **P0, money safety**

`/api/webhooks/paystack` accepted any POST with a reference. Activation itself
was safe (it re-verifies server-to-server), but anyone could drive the endpoint,
and a body could be replayed. It now verifies the `x-paystack-signature`
HMAC-SHA512 over the **raw** body with a constant-time compare, and only acts on
`charge.success` — refunds and chargebacks carry references too, and acting on
them would have looked like a payment.

### 3. Nothing told you a deployment was misconfigured — **P1**

`worker/src/lib/envcheck.ts` produces a report (`/healthz` → `config`). It names
which setting is wrong and never its value, so it is safe to leave public for
uptime checks. It catches: missing secrets, committed placeholders
(`dev-only-…`), short secrets, `http://` in production, `APP_URL` disagreeing
with `WEB_ORIGIN` (emails and the sitemap would point at the wrong host), and
**`PAYSTACK_MOCK=1` in production** — every checkout "succeeding" without money
moving.

`node scripts/check-env.mjs` is the pre-deploy gate: it checks the Vercel env,
the Worker's production vars, and local `.dev.vars`, then prints the exact
`wrangler secret put` commands for whatever is outstanding.

### 4. No security headers — **P1**

`web/next.config.ts` now sets CSP (with `frame-ancestors` allowing the preview
hosts so branch previews keep working), `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy` (camera/microphone on self only — voice
notes and photos), and HSTS on production origins. `unsafe-eval` is dev-only.

### 5. Production config was mixed into the dev config — **P1**

`worker/wrangler.jsonc` carried production-looking URLs **with
`PAYSTACK_MOCK=1`** in the same vars block that local dev uses. Production now
lives in `env.production`; deploy with `wrangler deploy --env production`.

### 6. No runbook, no backups — **P1**

`docs/production.md` is the ordered go-live list: create the remote D1, set the
six required secrets (with what each one breaks if it's wrong), set the hosts,
deploy, configure Paystack, deploy Vercel, first boot, backups, routine ops, and
a rehearsal checklist. `scripts/backup-d1.sh` dumps and prunes to 30 copies.

### 7. Vendors had no idea what to do next — **P1**

The dashboard showed numbers but no actions. **Store strength** scores the store
on the twelve things a buyer looks for before tapping WhatsApp — photo, About
text, WhatsApp number, three listings, a photo on every item, address, hours,
categories, socials, an offer, ID verification — and lists what's left, heaviest
first, each linking to the screen that fixes it. Server-rendered, so there is no
spinner.

### 8. Vendors could not read their own analytics — **P1**

Events were collected and rolled up hourly, but the only place a vendor saw them
was four counters and a top-five list on the overview, both fixed at 30 days.
Dashboard → Analytics now gives them a real read model
(`worker/src/lib/vendor-analytics.ts`): totals with the change against the
previous equal window, a gap-filled daily trend (a day with no traffic is a zero,
not a missing row, or the chart silently compresses time), per-listing views /
clicks / view-to-WhatsApp rate, and the hour and weekday most clicks land on.
Pure CSS, no chart library. Three tests cover the trend, the deltas and
cross-store isolation.

### 9. Shared links rendered as a bare photo — **P1, growth**

This marketplace grows by vendors pasting a listing into a WhatsApp group, so
the preview *is* the shop window. Listings and stores declared
`og:image` at 1200×630 while linking to a photo of whatever aspect the vendor
uploaded. There are now composed 1200×630 cards — photo right, price big and
green, store name, city, verified or official badge — for the site, every store
and every listing (`web/lib/og-card.tsx`). If a photo can't be fetched the card
renders without it instead of 500ing: a share that breaks is worse than a share
with no photo.

---

## Next, in the order I would build it

### P1 — before the first paying vendor

| # | Gap | Why it matters | Effort |
|---|---|---|---|
| 1 | **Reports have no workflow.** The queue exists, but a report has no state (new → triaged → actioned), no assignment, no SLA clock, and the reporter is never told the outcome. | Trust is the product in a no-checkout marketplace. An unanswered report is the fastest way to lose it. | 2 days |
| 3 | **No payment reconciliation.** Payments are recorded locally; nothing compares them against Paystack daily or exports for accounting. | A drift between "approved in CyberShop" and "settled by Paystack" is invisible until it's expensive. | 1–2 days |
| 3 | **Admin accounts have no 2FA.** An admin approves payments, verifies IDs, suspends stores. | One phished password is a money and reputation problem. | 1–2 days |
| 4 | **Admin tables don't stack on phones** (carried over from the responsive audit). Below ~640px they are horizontal scrollers. | Admins triage from phones. | 1 day |

### P2 — before scale

| # | Gap | Why | Effort |
|---|---|---|---|
| 5 | **Analytics has no export.** The screen exists; there is no CSV download or date-range picker (7/30/90 presets only). | Accountants and agencies want the file. | 0.5 day |
| 6 | **Search is `LIKE '%q%'`** ordered by featured-then-newest. Fine to ~10k listings. | After that: no typo tolerance, no relevance, no "did you mean", slow queries. Move to FTS5 or an index. | 3–5 days |
| 7 | **No alerting.** Cloudflare observability is on, but nothing routes errors to a human. | You learn about a broken checkout from a vendor, not from a dashboard. | 0.5 day |
| 8 | **`<button>` nested inside `<a class="card">`** on listing cards — invalid HTML (carried over from round 1). | Screen readers and keyboard users get two overlapping targets. | 0.5 day |
| 9 | **No vendor notification preferences.** Lead alerts are all-or-nothing. | Vendors who can't tune it mute it, and then churn. | 1 day |
| 10 | **Session/device management.** No "log out my other devices", no active sessions list. | Standard account hygiene; cheap. | 0.5 day |
| 11 | **Media gateway is untested end to end.** `MEDIA_DRIVER=gateway` is written but only D1 is exercised in tests. | The documented production path is the one nobody has run. | 1 day |

### P3 — deliberately not built, and why

- **Checkout / escrow by default.** The whole design is "talk on WhatsApp, verify
  before you pay" — that is what keeps this honest in a market where buyers get
  burned. Deposits exist for the vendors who want them. Making checkout the
  default would create a buyer-protection expectation the platform cannot meet.
- **Multi-currency / i18n.** NGN and English only. Correct for a Port Harcourt
  and Lagos launch; expensive to bolt on later if done badly.
- **Native mobile app.** The site is already installable (manifest + service
  worker) and the growth loop is WhatsApp links.
- **Vendor payouts.** Vendors sell off-platform, so CyberShop never holds
  customer money except deposits. There is nothing to pay out.

---

## The one thing I would watch

The most likely way this product fails is not technical. It is a buyer getting
scammed by someone using a free platform, and the platform getting the blame.
The safety work (ribbon, per-CTA reminder, `/safety`, terms, reports, blocks)
is the moat — every new surface that touches money or messaging should keep
adding to it, not route around it.
