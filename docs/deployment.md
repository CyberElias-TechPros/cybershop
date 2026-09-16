# CyberShop — Production Deployment Guide

Deploys the Phase-1 stack onto the three free-tier services the platform was
designed around (D-011):

1. **Cloudflare** — Worker (all API) + D1 (database)
2. **Vercel** — Next.js web app (public site, vendor dashboard, admin)
3. **cPanel** — PHP media gateway on the existing ~100GB host (public media)

Order matters: **Worker first** (web points at it), then **media gateway**
(switch `MEDIA_DRIVER`), then **Vercel** (flip the domain last).

Estimated time: ~1.5 hours, of which most is DNS propagation and Paystack setup.

---

## 0. Prerequisites

- A Cloudflare account (free) + the domain you'll serve the site from
  (e.g. `yourshop.ng`), managed in Cloudflare.
- A Vercel account (free) with the GitHub repo installed/linked.
- cPanel access to the 100GB host + a subdomain for media
  (e.g. `media.yourshop.ng`) pointing at that host.
- (Later) Paystack account: Business account → API keys + a webhook slot.
- Generate three random secrets (32+ chars each), e.g.
  `openssl rand -hex 32` — you'll use them on **both** Cloudflare and
  Vercel/cPanel:
  - `INTERNAL_SECRET` — Vercel ↔ Worker
  - `GATEWAY_SECRET` — Worker ↔ PHP gateway
  - `AUTH_SECRET` — session signing (Worker only)
  - plus `IP_SALT` (any random string)

> **Backups before you deploy:** none needed for a fresh DB. If you redeploy over
> an existing D1, export it first: `npx wrangler d1 export cybershop --remote`.

---

## 1. Cloudflare — D1 database

```bash
cd worker

# 1.1 create the database (prints a database_id — UUID)
npx wrangler d1 create cybershop
```

**1.2** Open `worker/wrangler.jsonc` and replace the placeholder
`database_id` (`00000000-…`) with the UUID from 1.1. This file is committed —
the ID is public, not a secret.

**1.3** Apply migrations to the **remote** database:

```bash
npx wrangler d1 migrations apply cybershop --remote
```

Expected: `0001_init` (32 tables), `0002_seed` (categories, item types, plans,
add-ons, default settings), `0003_audit_nullable_actor`.

---

## 2. Cloudflare — Worker secrets + deploy

```bash
# 2.1 secrets (prompted, stored in Cloudflare; never in git)
npx wrangler secret put AUTH_SECRET
npx wrangler secret put INTERNAL_SECRET
npx wrangler secret put GATEWAY_SECRET
npx wrangler secret put IP_SALT
npx wrangler secret put PAYSTACK_PUBLIC_KEY      # pk_live_… (or placeholder pre-launch)
npx wrangler secret put PAYSTACK_SECRET_KEY      # sk_live_…
npx wrangler secret put RESEND_API_KEY           # re_… (enables transactional email)
npx wrangler secret put MAIL_FROM                # CyberShop <noreply@yourshop.ng>
npx wrangler secret put SEED_ADMIN_EMAIL         # e.g. you@yourshop.ng
npx wrangler secret put SEED_ADMIN_PASSWORD      # long random — you will change it after first login

# 2.2 non-secret environment
npx wrangler deployments create --env APP_URL=https://yourshop.ng \
  --env WEB_ORIGIN=https://yourshop.ng \
  --env SESSION_SECURE=1 \
  --env MEDIA_DRIVER=d1 \
  --env MEDIA_BASE_URL=https://media.yourshop.ng \
  --env GATEWAY_PUBLIC_URL=https://media.yourshop.ng \
  --env PAYSTACK_MOCK=1 \
  --env PAYSTACK_WEBHOOK_URL=https://<worker-name>.<account>.workers.dev/api/webhooks/paystack
# (repeat --env for each; or use wrangler.jsonc `vars` for the non-secrets)

# 2.3 deploy
npx wrangler deploy
```

**2.4** Verify:

```bash
curl https://<worker>.<account>.workers.dev/healthz
# {"ok":true,"service":"cybershop-api",...}
```

**2.5** First-boot admin: any request triggers `ensureAdmin` (idempotent) —
log in at the web app (step 5) with `SEED_ADMIN_EMAIL/PASSWORD` and **change
the password** (new user → set password, or via DB). Consider removing
`SEED_ADMIN_*` afterwards; keep them only if you want drift-healing on rebuilds.

> Deploy with `MEDIA_DRIVER=d1` first (step 4 below flips it). That way the
> site is fully functional before the gateway is verified.

---

## 3. Media gateway — cPanel host

**3.1 Subdomain:** cPanel → *Subdomains* → add `media.yourshop.ng`, docroot
e.g. `/home/USER/media` (or `public_html/media` if you prefer the root domain's
`/media/…` path). Point the DNS A/CNAME at this host (or use Cloudflare proxy
— *proxied* is fine and faster for static files).

**3.2 Files:** upload `media-gateway/` contents **into the subdomain docroot**:

```
<docroot>/upload.php
<docroot>/config.php          (from config.example.php — see 3.3)
<docroot>/.htaccess           (from media-gateway/.htaccess)
<docroot>/media/.htaccess     (contents of media-gateway/media-htaccess.txt)
```

The `media/` directory is created on first upload; pre-create it with the
`.htaccess` inside. **Do not** leave `config.example.php` or the test scripts
in the docroot.

**3.3 `config.php`:**

```php
const GATEWAY_SECRET = '<same GATEWAY_SECRET as the Worker>';
const MEDIA_ROOT     = __DIR__;   // docroot — files land in <docroot>/media/…
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
```

**3.4 PHP requirements:**
- PHP **8.0+** (cPanel → *MultiPHP*: select 8.1/8.2 for this subdomain).
- GD extension enabled (EXIF stripping; without it uploads still work).
- INI limits (cPanel → *MultiPHP INI Editor*):
  `upload_max_filesize = 10M`, `post_max_size = 12M`.

**3.5 Verify the gateway end-to-end (do this BEFORE flipping MEDIA_DRIVER):**

```bash
# from a machine with PHP 8 (the cPanel box has ssh, or use a local copy):
cd media-gateway
cp config.example.php config.php    # put the REAL GATEWAY_SECRET
WORKER_URL=https://<worker>.<account>.workers.dev \
VENDOR_EMAIL=<a vendor you created> VENDOR_PASSWORD=<its password> \
./test-upload.sh
# expect: PASS: gateway token -> upload -> serve -> finalize (all OK)
```

Also sanity-check from the browser:
`https://media.yourshop.ng/` → directory listing must be **denied**;
`https://media.yourshop.ng/upload.php` → `{"ok":false,"error":"missing token or key"}`;
any uploaded file URL must serve the image.

---

## 4. Flip the Worker to the gateway driver

```bash
# update the non-secret var (see 2.2 for your wrangler method of choice):
npx wrangler deployments create --env MEDIA_DRIVER=gateway
# (or: npx wrangler secret put doesn't apply — vars; simplest: edit
#  wrangler.jsonc "vars": {"MEDIA_DRIVER":"gateway"} and npx wrangler deploy)
```

Upload through the vendor dashboard → the file should appear under
`https://media.yourshop.ng/media/vendors/…` and show on the public item page.
OG image test: paste an item URL into any chat app (WhatsApp/Telegram) —
the preview card must show the cover image.

---

## 5. Vercel — web app

1. Import the repo; set **Root Directory = `web`**, framework Next.js (auto).
2. Environment variables (Production + Preview):

   | Var | Value |
   |---|---|
   | `WORKER_URL` | `https://<worker>.<account>.workers.dev` |
   | `WORKER_INTERNAL_SECRET` | == Worker `INTERNAL_SECRET` |
   | `SITE_URL` | `https://yourshop.ng` |

   The web app itself never sends email — transactional mail lives on the
   Worker. Configure it there (step 3 of the Worker section):

   | Worker secret | Required | Effect |
   |---|---|---|
   | `RESEND_API_KEY` | no (recommended) | Sends via Resend (`RESEND_API_KEY` + `MAIL_FROM`, e.g. `CyberShop <noreply@yourshop.ng>`) |
   | `MAIL_ENDPOINT` | no (fallback) | Posts JSON `{from,to,subject,text,html}` to your own MailChannels-style relay |
   | `MAIL_FROM` / `MAIL_FROM_NAME` | no | Sender identity; falls back to `MAIL_FROM_NAME <noreply@<SITE_URL host>>` |
   | _(none of the above)_ | — | Emails are logged to Worker logs instead of sent (dev mode; password-reset links surface in the API response) |

   Emails sent: password resets, payment approved/rejected (with receipt
   link), subscription expiry reminders, business verification decisions,
   new-lead alerts.

3. Build & deploy (`next build` runs automatically).
4. **Domain:** add `yourshop.ng` (Vercel → Domains) and set DNS in Cloudflare:
   A `yourshop.ng` → Vercel (as instructed), CNAME `www` → `cname.vercel-dns.com`.
   Vercel auto-provisions TLS.
5. Verify: home page renders, `/api/healthz`-style proxy works (log in as
   admin), public storefront + item page + WhatsApp preview card.

> Keep the site on the gateway-free D1 driver (step 2 default) until the
> step-4 flip is verified — the dashboard's Media page shows the active driver.

---

## 6. Paystack (live payments)

1. Paystack Dashboard → *Settings → API Keys*: `pk_live_…` / `sk_live_…`.
2. Paystack Dashboard → *Settings → Webhooks* → add:
   **URL:** `https://<worker>.<account>.workers.dev/api/webhooks/paystack`
   **Events:** `charge.success` (and `charge.failed` for notifications).
3. Worker: set live `PAYSTACK_PUBLIC_KEY`/`PAYSTACK_SECRET_KEY` secrets and
   `PAYSTACK_MOCK=0` (re-deploy).
4. **Test with real money (₦1):** create a test vendor, buy the Starter plan
   with Paystack, confirm: payment auto-approves in seconds, business
   activates, audit log shows a system-actor row, vendor notification arrives.
5. The bank-transfer path needs no setup — the platform's bank accounts are
   configured by the admin in **Settings → Bank accounts** (shown to vendors on
   the billing page).

---

## 7. Launch checklist

- [ ] D1 migrations applied to remote; `wrangler d1 migrations list --remote` shows all up-to-date
- [ ] Worker `/healthz` 200 on the workers.dev URL
- [ ] Admin login works; **SEED admin password changed**; consider removing `SEED_ADMIN_*`
- [ ] Plans/add-ons/categories reviewed in **Admin → Plans / Categories** (seeds are admin-editable defaults)
- [ ] Bank accounts set in **Admin → Settings**
- [ ] Platform name/tagline/support email set (Admin → Settings)
- [ ] Media gateway: `test-upload.sh` PASS; directory listing denied; files serve over HTTPS
- [ ] `MEDIA_DRIVER=gateway` live; a real upload visible on the public page
- [ ] WhatsApp preview card shows cover image (test via a real WhatsApp chat)
- [ ] Paystack live: webhook registered, mock off, ₦1 test auto-activated
- [ ] Bank proof flow tested E2E (upload proof → admin approve → active)
- [ ] `robots.txt` + `sitemap.xml` correct; submit sitemap to Google Search Console
- [ ] Cron running (check Cloudflare dashboard → Worker → Triggers; first run at the top of an hour +17 min)
- [ ] **Media backup job:** schedule cPanel → *Backup Wizard* (or nightly `tar`
      of `<docroot>/media/`) — it's the only data that doesn't live in D1/Vercel
- [ ] Cloudflare + Vercel account email: ensure a second contact can recover
      the domains (domain lock-in is the real production risk)

## 8. Rollback & operations

- **Rollback web:** Vercel → Deployments → *Promote* the previous deployment.
- **Rollback API:** `npx wrangler deployments list` → deploy the previous
  version. DB schema changes are additive; keep a `0004_…` per change and
  note breaking ones here.
- **DB export (before risky changes):**
  `npx wrangler d1 export cybershop --remote > backup-$(date +%F).sql`
- **Suspend a vendor:** Admin → Vendors → Suspend (storefront goes dark
  immediately; catalogue data retained).
- **Suspend a payment approval queue backlog:** Admin → Payments (submitted
  first) — approvals are the only human gate in the money path.
- **If the media host goes down:** flip `MEDIA_DRIVER=d1` (re-deploy) — new
  uploads go to D1; previously uploaded URLs are dead until the host returns
  (mitigated by the backup job). This is a known trade-off of single-host
  media (D-002).

## 9. Free-tier headroom (what to watch as you grow)

| Limit | Free | When it bites | Move to |
|---|---|---|---|
| Worker requests | 100k/day | busy public day (each page view ≈ 2–4 API calls) | Workers Paid (10M/day) |
| D1 storage | 5GB | many private proofs / d1-mode media | D1 paid or Postgres (Neon/Supabase) |
| Vercel bandwidth | 100GB/mo | image-heavy public site | Vercel Pro |
| cPanel disk | ~100GB | thousands of vendors with photos | any static host behind the same `MEDIA_BASE_URL` |

No code changes are required for any of these moves — the architecture is
placement-agnostic by design (see `docs/architecture.md` §9).
