# Going live — the whole runbook

Everything in this repository works today with demo keys. This document is the
ordered list of what changes to go live. Nothing here requires a code change:
**you are adding keys, hosts and a Paystack account, and then running commands.**

Two services make up CyberShop:

| | What it is | Where it runs | Built from |
|---|---|---|---|
| **web** | the Next.js storefront, dashboards and admin console | Vercel | `web/` |
| **worker** | the Hono API + D1 database + cron | Cloudflare Workers | `worker/` |

The browser never talks to the Worker directly. `web/app/api/[...path]/route.ts`
proxies same-origin `/api/*` to the Worker and adds `x-internal-secret`, so the
Worker is not publicly callable and there is no CORS story to maintain.

---

## 0. Before you start

```bash
node scripts/check-env.mjs         # tells you exactly what is missing
```

It exits non-zero if anything is genuinely wrong and prints the copy-paste
`wrangler secret put` commands for whatever secrets are outstanding. It never
prints a secret value.

---

## 1. Cloudflare — create the remote database

```bash
cd worker
npx wrangler d1 create cybershop
```

Wrangler prints the `database_id`. Paste it into **both** places in
`worker/wrangler.jsonc` (the top-level `d1_databases` block is shared by the
`production` environment). Then apply the schema to the remote database:

```bash
npx wrangler d1 migrations apply cybershop --remote
```

Do this again after every merge that adds a file under `worker/migrations/`.

---

## 2. Cloudflare — set the secrets

Secrets are **not** in `wrangler.jsonc` and must never be committed. Each
command below prompts for the value and stores it encrypted:

```bash
cd worker
npx wrangler secret put AUTH_SECRET          --env production     # openssl rand -hex 32
npx wrangler secret put INTERNAL_SECRET      --env production     # openssl rand -hex 32
npx wrangler secret put GATEWAY_SECRET       --env production     # openssl rand -hex 32
npx wrangler secret put IP_SALT              --env production     # openssl rand -hex 32
npx wrangler secret put PAYSTACK_SECRET_KEY  --env production     # sk_live_…
npx wrangler secret put PAYSTACK_PUBLIC_KEY  --env production     # pk_live_…
```

What each one does:

| Secret | Used for | If it is wrong |
|---|---|---|
| `AUTH_SECRET` | signs session tokens | everyone is logged out; worse, sessions are forgeable if it is a known value |
| `INTERNAL_SECRET` | proves a request came from the Next.js proxy | every `/api/*` call 403s |
| `GATEWAY_SECRET` | signs media upload tokens (`MEDIA_DRIVER=gateway`) | uploads fail |
| `IP_SALT` | hashes visitor IPs before storing them | rate limiting and abuse checks key on the wrong value |
| `PAYSTACK_SECRET_KEY` | charges cards, verifies payments server-to-server, verifies webhook signatures | no card payments, webhooks rejected |
| `PAYSTACK_PUBLIC_KEY` | Paystack inline checkout | checkout will not load |

Optional but recommended:

```bash
npx wrangler secret put RESEND_API_KEY       --env production     # resend.com → API Keys
npx wrangler secret put MAIL_FROM            --env production     # "CyberShop <noreply@cybershop.ng>" (verified domain)
npx wrangler secret put VERCEL_TOKEN         --env production     # vercel.com/account/tokens
npx wrangler secret put VERCEL_PROJECT_ID    --env production     # Vercel project settings
npx wrangler secret put SEED_ADMIN_EMAIL     --env production
npx wrangler secret put SEED_ADMIN_PASSWORD  --env production
```

`RESEND_API_KEY` is what makes email verification, password resets and lead
notifications actually arrive. Without it the app still works but every mail is
logged and dropped. `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` are only needed for
vendor custom domains; without them an admin attaches the domain by hand (the
DNS challenge still works).

`SEED_ADMIN_*` creates the very first admin account on first boot. **Unset them
once that admin exists** — they are a standing "create an admin" instruction.

---

## 3. Cloudflare — set the production hosts

Edit `worker/wrangler.jsonc` → `env.production.vars`:

| Var | Set it to |
|---|---|
| `APP_URL` | public origin of the Next.js site, e.g. `https://cybershop.ng` |
| `WEB_ORIGIN` | the same value |
| `SESSION_SECURE` | `1` (puts `Secure` on the session cookie) |
| `MEDIA_DRIVER` | `d1` to start; `gateway` when uploads outgrow the D1 plan |
| `MEDIA_BASE_URL` | the origin images are served from |
| `GATEWAY_PUBLIC_URL` | the cPanel media host (gateway driver only) |
| `PAYSTACK_MOCK` | `0`. **Never `1` in production** — every checkout "succeeds" without money moving |
| `PAYSTACK_WEBHOOK_URL` | `https://<worker-host>/api/webhooks/paystack` |

`APP_URL` matters more than it looks: it is baked into every email, every
WhatsApp deep link and the sitemap. `/healthz` warns if it disagrees with
`WEB_ORIGIN`.

---

## 4. Cloudflare — deploy the Worker

```bash
cd worker
npx wrangler deploy --env production
```

Note the deployed host (e.g. `cybershop-api.<account>.workers.dev`). Put it in
`PAYSTACK_WEBHOOK_URL` and redeploy if you did not know it yet.

Then confirm the configuration landed:

```bash
curl -s https://<worker-host>/healthz | jq .config
# → { "ok": true, "production": true, "missing": [], "unsafe": [], "warnings": [] }
```

Anything in `missing`, `unsafe` or `warnings` is a specific instruction. This
endpoint is public and deliberately coarse — it names the setting, never the
value — so it is safe to leave on for uptime checks.

The hourly cron (`subscribed expiry, publishing scheduled listings, saved-search
alerts, analytics rollup`) is declared in `wrangler.jsonc` and deploys with the
Worker. No extra step.

---

## 5. Paystack

1. Create the account and complete activation (Nigerian businesses need CAC +
   bank details; payouts depend on it).
2. **Settings → API Keys & Webhooks** → copy `sk_live_…` / `pk_live_…` into the
   secrets above.
3. Set the **webhook URL** to `https://<worker-host>/api/webhooks/paystack`.
   Paystack only POSTs to https.
4. Copy the **webhook signing secret** — it is the same value as
   `PAYSTACK_SECRET_KEY`, which is what `worker/src/routes/webhook.ts` uses to
   verify the `x-paystack-signature` HMAC-SHA512 over the raw body.

How money is actually settled, so you know what you are turning on:

- **Card** — the vendor is redirected to Paystack, pays, Paystack POSTs to the
  webhook. We do **not** trust the webhook body: it triggers a
  server-to-server `transaction/verify/:reference` call, and only a real
  `success` activates the plan.
- **Bank transfer** — the vendor creates an intent, uploads a proof image, and
  an admin approves it under **Admin → Payments**. Rejecting it releases any
  referral credit that was held.
- Both paths converge on the same `payments` row and the same activation code.

Leave `PAYSTACK_MOCK=1` on a staging Worker to rehearse without money. The
`/paystack/mock` endpoint and the mock checkout page only exist in mock mode.

---

## 6. Vercel — deploy the web app

Import the repository (root of the repo; Next is detected in `web/` — set the
**Root Directory** to `web`). Then set these three environment variables:

| Var | Value |
|---|---|
| `WORKER_URL` | `https://<worker-host>` (no trailing slash) |
| `WORKER_INTERNAL_SECRET` | the same value as the Worker's `INTERNAL_SECRET` |
| `SITE_URL` | `https://cybershop.ng` — the public origin, https |

`SITE_URL` drives canonical URLs, Open Graph tags, `robots.txt` and the
sitemap. `WORKER_URL` is server-side only; the browser only ever sees
same-origin `/api/*`.

Add your domain under **Settings → Domains**. Vendor custom domains are
attached automatically when `VERCEL_TOKEN`/`VERCEL_PROJECT_ID` are set
(otherwise an admin does it from **Admin → Domains** using the DNS challenge
that screen prints).

---

## 7. First boot

1. Open `https://<site>/login` and sign in with the `SEED_ADMIN_*` credentials.
2. **Immediately change that password** (Account → Settings), then remove the
   two `SEED_ADMIN_*` secrets:
   ```bash
   cd worker
   npx wrangler secret delete SEED_ADMIN_EMAIL    --env production
   npx wrangler secret delete SEED_ADMIN_PASSWORD --env production
   ```
3. **Admin → Settings**: bank accounts for transfers, the trust & safety
   notice, the default message templates.
4. **Admin → Plans / Categories** — the seeded ones are a starting point.

### Cyber Elias Academy is already on the highest plan

CyberShop is CEA's own platform, so CEA's store is **entitled to Enterprise
permanently, at no cost** — no invoice, no expiry, no renewal. It is a real
platform entitlement, not a seeded shortcut:

- `businesses.plan_override = 'enterprise'` is the source of truth, read by
  `worker/src/lib/entitlement.ts`.
- A `subscriptions` row with `expires_at = NULL` is kept in sync, so every
  screen that reads the subscription sees Enterprise.
- The hourly cron re-asserts the entitlement before anything else runs, and the
  expiry sweeps skip `expires_at IS NULL` **and** `plan_override IS NOT NULL`,
  so the store cannot be expired, suspended or downgraded by the billing
  lifecycle. It is also auto-verified and featured.
- Its billing screen says "on the house" instead of showing a renewal date and
  a Pay Now button.

To apply the same to any store: **Admin → Vendors → Grant plan**. A reason is
required and is written to the audit log. Revoking gives the vendor 30 days
before the plan ends.

---

## 8. Backups

D1 keeps point-in-time recovery, but take your own dump on a schedule:

```bash
./scripts/backup-d1.sh                 # remote, timestamped dump to backups/
./scripts/backup-d1.sh --local         # local dev database
```

Put it on cron (daily) and copy `backups/` somewhere off the machine. A dump
without an off-box copy is not a backup.

---

## 9. Routine operations

| Task | Where |
|---|---|
| Approve a bank transfer | Admin → Payments |
| Verify a vendor's ID | Admin → Verifications |
| Take down a listing / act on a report | Admin → Reports — pick an outcome; the action happens with the decision |
| Suspend a store | Admin → Vendors → Suspend |
| Grant a free plan | Admin → Vendors → Grant plan |
| Edit the safety notice | Admin → Settings → Trust & safety notice |
| Extend/cancel a subscription | Admin → Subscriptions |
| See everything an admin did | Admin → Audit log |
| See what has been failing | Admin → Health |
| Check the books against Paystack | Admin → Reconciliation |

| Check | How often | How |
|---|---|---|
| Config is healthy | after every deploy | `curl -s <worker>/healthz \| jq .config` |
| Failed payments | daily | Admin → Payments (filter `failed`) |
| Reports queue | daily | Admin → Reports (anything breached is flagged in red) |
| Pending verifications | daily | Admin → Verifications |
| Server errors | daily | Admin → Health (a notification is already sent if the rate spikes) |
| Money matches Paystack | weekly, and after any payment incident | Admin → Reconciliation |
| Database dump | daily | `./scripts/backup-d1.sh` |
| Worker errors | ongoing | Cloudflare dashboard → Workers → Logs (observability is enabled) |

Two of these run themselves. The hourly cron reconciles yesterday's payments
and notifies every admin if anything disagrees, and it watches the error rate
and alerts once per bad hour rather than once per error — an alert you learn to
ignore is worse than no alert. Both are idempotent, so a missed hour is not a
gap, and neither can take the hourly job down with it.

---

## 10. What to rehearse before announcing

Walk these once on production with real keys, end to end:

1. **Buyer** — register → verify email → save a listing → send an enquiry →
   save a search → write a review.
2. **Vendor** — register → pick a plan → pay by card → store goes live
   automatically → add a listing with photos and a voice note → receive a lead
   → mark it won → view the receipt.
3. **Vendor, bank transfer** — same, but upload proof → admin approves →
   store goes live.
4. **Admin** — suspend a store, take down a listing, verify a vendor, extend a
   subscription.
5. **Expiry** — set a subscription to expire in the past, run
   `curl -X POST <worker>/api/cron/hourly -H "x-internal-secret: …"`, confirm
   the store moves to expired → grace → suspended, and that the platform
   owner's store did **not** move.
6. **Share** — paste a listing link into WhatsApp and confirm the card, title
   and price render.
7. **Second factor** — with `REQUIRE_ADMIN_2FA=1`, sign in as each admin and
   confirm they are sent to Settings → Security to enrol before they can reach
   the console. Have one of them lose their phone on purpose and sign back in
   with a recovery code.
8. **Reports end to end** — as a buyer, report a listing. As an admin, claim
   it, close it as "Remove the listing", and confirm the buyer got told *and*
   the listing came down. Then check the SLA clock on a fresh report reads 48h.

---

## Reference — every setting in one place

### Worker secrets (encrypted, never in git)

`AUTH_SECRET` · `INTERNAL_SECRET` · `GATEWAY_SECRET` · `IP_SALT` ·
`PAYSTACK_SECRET_KEY` · `PAYSTACK_PUBLIC_KEY`
— plus optional `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME`,
`MAIL_ENDPOINT`, `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`,
`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`.

### Worker vars (`wrangler.jsonc` → `env.production.vars`)

`APP_URL` · `WEB_ORIGIN` · `SESSION_SECURE` · `MEDIA_DRIVER` ·
`MEDIA_BASE_URL` · `GATEWAY_PUBLIC_URL` · `PAYSTACK_MOCK` ·
`PAYSTACK_WEBHOOK_URL` · `REQUIRE_ADMIN_2FA`

`REQUIRE_ADMIN_2FA` is off by default so a fresh install is not locked out on
day one. Set it to `1` once **every** admin has enrolled — an admin without a
second factor is then refused the console entirely until they set one up. An
admin approves bank transfers, verifies identity documents, suspends stores and
grants plans; a password alone should not be that powerful.

### Vercel env vars

`WORKER_URL` · `WORKER_INTERNAL_SECRET` · `SITE_URL`
