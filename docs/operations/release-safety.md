# Release safety: production guardrails and verification

Updated 2026-10-22. This is repository-level implementation evidence, **not a deployment record**. No remote database was migrated, live payment made or store submission performed.

## What changed

- Backend deployment calls reusable CI and waits for web, Worker, release-tool and real-PHP tests for the same checked-out commit.
- Deployment is main-only, serialized, and targets the GitHub `production` environment. **An owner must configure that environment's protection/reviewers and access rules**; naming it in YAML does not create reviewer protection.
- Migrations, backup and deployment explicitly select `--env production`. The production D1 binding is explicit; its ID was copied from the existing repository configuration, not remotely discovered or verified.
- The Worker now has an explicit `APP_ENV` and distinguishes `/healthz` liveness from `/readyz` readiness. Readiness checks config plus D1 connectivity, returns HTTP 503 on failure, uses `no-store`, and reports a release SHA.
- Hosted configurations require secure cookies, nonmock provider verification, correct test/live key mode, HTTPS URLs, mail provider/sender and production admin 2FA. Hosted operations fail closed before bootstrap/payment processing when configuration is unsafe.
- Mock payment callbacks cannot run on a hosted profile, even if `PAYSTACK_MOCK=1` was accidentally set.
- A real Cloudflare `scheduled` handler now invokes hourly maintenance, awaits completion, records timing and rejects failures to platform monitoring. Owned expiring leases and durable run history now prevent overlapping hourly runs. Per-job checkpoints, external alerts and recovery drills remain follow-up work.
- Integration suites own temporary configuration, random ports and local D1 state. They do not load/overwrite `.dev.vars` or kill arbitrary port listeners.

## Production setup prerequisites

Do not run a live release just to test these safeguards. First verify ownership of the existing resources, migrations, financial flows, recovery process and enabled features.

Configure these through GitHub's protected settings, **not in chat or Git**:

| Setting | Type | Purpose |
|---|---|---|
| `PRODUCTION_WORKER_URL` | Repository/environment variable | Confirmed HTTPS Worker origin; must agree with `PAYSTACK_WEBHOOK_URL` in production vars |
| `CLOUDFLARE_API_TOKEN` | Protected secret | Least-privilege intended account/Worker/D1 access |
| `CLOUDFLARE_ACCOUNT_ID` | Protected secret | Intended existing account |
| `D1_BACKUP_PASSPHRASE` | Protected secret | Strong random value, at least 32 characters, independently backed up in approved custody |

The checked-in webhook host was taken from the **previous deployment workflow**, not a remote health check. If it is not the intended host, update the production webhook and configured origin together before release.

Provision Worker secrets in the **production environment**, including:

- `AUTH_SECRET`, `INTERNAL_SECRET`, `IP_SALT` (strong random values).
- `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY` (live account keys).
- `RESEND_API_KEY` or `MAIL_ENDPOINT`, plus `MAIL_FROM` (verified sender).
- `MAIL_OUTBOX_KEY` (independent strong random encryption material; required in staging/production). Keep it separate from `AUTH_SECRET` and preserve recovery custody.
- `GATEWAY_SECRET` when using gateway media.
- Initial administrator bootstrap credentials only for controlled first setup; remove after bootstrap, enroll 2FA, and retain recovery procedures.

The inventory check confirms names, not that their values are valid. Runtime readiness checks values structurally, not provider account activation, actual mail delivery or payment settlement. Those need the roadmap's real integration acceptance.

## Local/static checks (no live mutation)

```bash
node --test scripts/tests/*.test.mjs
PRODUCTION_WORKER_URL=https://CONFIRMED-WORKER-ORIGIN node scripts/check-production-config.mjs
cd worker
npm run typecheck
npm test
npx wrangler deploy --env production --dry-run --outdir .wrangler/release-dry-run
```

The example origin must be replaced with an owner-confirmed real origin. Do not use a production profile for local/mock development. Staging must have independently provisioned D1/media/credentials, `APP_ENV=staging`, secure HTTPS origins and Paystack **test** keys. A staging resource/environment has **not** been provisioned in this pass.

## Protected deployment order

1. Required CI jobs finish successfully for the exact release commit.
2. Owner-configured production-environment approval is granted.
3. Static config and production secret-name inventory pass.
4. The existing production D1 is exported to a restrictive temporary file.
5. Export is encrypted using AES-256-CBC with PBKDF2 (200,000 iterations) and a random salt; plaintext is removed by an EXIT trap.
6. Encrypted artifact and SHA-256 checksum are uploaded **before** applying migrations. Artifact name includes commit/run/attempt; retention is 14 days.
7. Migrations and Worker deployment explicitly target production; deployment injects `RELEASE_SHA`.
8. `/readyz` must report ready, production, reachable D1 and the expected SHA.

A failed readiness check fails the release job. It **does not automatically undo an already-applied migration or already-deployed Worker**. Review migrations for expand/contract compatibility and rehearse rollback before a real release. CI artifact backup is not the full ongoing/off-host media + database backup strategy.

## Backup recovery requirements

Keep the passphrase separately from the encrypted artifact and verify its custody before deploying. To decrypt a downloaded artifact on an approved isolated recovery machine:

```bash
# Supply D1_BACKUP_PASSPHRASE via an approved secret mechanism; never put it in shell history.
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in cybershop-COMMIT.sql.enc -out recovered.sql -pass env:D1_BACKUP_PASSPHRASE
```

Verify the artifact checksum. Restore SQL to an **isolated** database first and test it. Never commit recovered SQL. The SHA-256 checksum is not a substitute for independently trusted artifact storage. This pass has not proven a real production export/decryption/restore or media recovery drill.

## Payment contract fixes and evidence

The response schema was checked against Paystack's published OpenAPI repository at commit `07c5abc8c34536e98a7755a5338178b4f430b09b`:

- [TransactionInitializeResponse](https://github.com/PaystackOSS/openapi/blob/07c5abc8c34536e98a7755a5338178b4f430b09b/src/assets/openapi/components/schemas/TransactionInitializeResponse.yaml): `data.authorization_url`, not `data.authorization.url`.
- [VerifyResponse](https://github.com/PaystackOSS/openapi/blob/07c5abc8c34536e98a7755a5338178b4f430b09b/src/assets/openapi/components/schemas/VerifyResponse.yaml): reference, currency, amount and status fields.

Tests use **synthetic contract-shaped fixtures**, not captured sandbox/live traffic. The client now validates the checkout origin/reference, rejects invalid money units, sets a 10-second timeout, sanitizes provider failures and verifies matching reference/NGN/integer kobo. Local activation/deposit handlers require exact amount equality. Pending/processing confirmations no longer become permanently failed solely because success is not yet reported.

HMAC signature tests independently reject unsigned/tampered payloads and non-success event names. Provider timeouts and invalid responses throw, allowing webhook retries instead of committing false state. Migration 0016/0017 local concurrency and fault-injection tests cover atomic activation, refund records, credit holds and once-only credit return. Real provider charge/refund, financial-scope review and reconciliation acceptance remain open.

## PHP gateway corrections and compatibility

The gateway now reads the constants defined by its example config, refuses missing/placeholder configuration, handles approved cross-origin uploads/OPTIONS and checks a signed exact folder scope. WebP decoding uses the byte-string API rather than passing image bytes as a filename. Apache hardening denies config/tooling/backup files; `.gitignore` excludes live gateway config and signing artifacts.

**Coordinated rollout required:** tokens now contain signed `p` (authorized folder). Updated PHP rejects older unscoped tokens. Let existing upload sessions expire (10 minutes) or tell active uploaders to retry during a coordinated Worker/PHP release. Existing `config.php` files must define `ALLOWED_ORIGINS` using exact approved web origins; the gateway fails closed until this is supplied. No wildcard credentialed CORS is enabled.

```bash
# Native PHP 8.2+ (CI tests PHP 8.2 and 8.4 with GD)
php -l media-gateway/upload.php
python3 media-gateway/test_gateway.py

# Local fallback used in this sandbox: actual PHP 8.5 WASM HTTP runtime
PHP_COMMAND='npx --yes --package=@php-wasm/cli@3.1.60 php-wasm-cli' \
  python3 media-gateway/test_gateway.py
```

The WASM CLI executed successfully on this sandbox's Node 22, but its package declares a newer Node engine and emits engine warnings at installation. It is an optional local diagnostic, not a pinned production dependency or the CI PHP installation strategy.

The 17 real PHP HTTP tests cover upload/serve, CORS/preflight, bad origin/signature/expiry, tenant/folder scope, traversal, MIME/extension, size/empty file and overwrite protection. The built-in server does not enforce `.htaccess`; cPanel/Apache permissions, GD variants, end-to-end Worker→PHP→finalize with actual hosting, audio/private-file architecture and operational deletion still require staging acceptance.

## Recovery-code and dependency security follow-up

A full-suite run revealed that stripping every non-digit from a recovery code
occasionally routed it into TOTP verification (or discarded an all-letter code).
Login now classifies and canonicalizes recovery/TOTP formats without losing
letters. Recovery codes and authenticator replay state are consumed using atomic
compare-and-set updates before the pending session is promoted. Tests cover
ambiguous formats and concurrent attempts: exactly one can succeed.

Dependency audits also identified issues outside production-only packages. The
unused Cloudflare Vitest pool was removed (the suite uses its own real Wrangler
harness), Vitest was migrated to 5.0.5, Wrangler was updated, Hono to 4.13.13 and
Next.js to 15.5.28. Next's transitive PostCSS and source-map-js are explicitly
overridden to 8.5.31 and 1.2.2; sharp resolves to 0.35.5. Review these overrides
when upgrading Next, rather than carrying them forward blindly. Node 22.12+ on
supported release lines is required; `.nvmrc` and CI select Node 22. Both full
package audits (including development dependencies) report zero advisories at
this verification date; CI now fails on moderate-or-higher audit results.

## Default-off buyer-money collection

`BUYER_DEPOSITS_ENABLED=0` is explicit in the production profile and required by
the current static release gate. New real buyer-deposit creation and deposit
add-on purchases are denied before writes/provider calls; the public capability
is hidden. Existing references, settlement webhook processing and ledger access
are not switched off, so a hold cannot strand previously created payments.
Local mock premium tests remain usable. Enabling real collection requires the
financial/legal/provider decisions in R03/R09/R10 and a reviewed change to the
release gate; do not treat a feature flag as approval of the money model.


## Durable mail and payment rollout — 2026-10-22

These migrations and application changes have **not** been deployed remotely.
Do not promote solely because clean-schema local tests pass.

### Prerequisites and migration order

1. Provision a separate `MAIL_OUTBOX_KEY` in approved platform secret storage.
   Production/staging refuse the session-secret fallback; readiness and release
   inventory require the key. Do not paste values into issues, chat or logs.
2. Back up D1 and media, verify decryption custody, and restore to **isolated**
   resources. Rehearse migrations `0015` → `0016` → `0017` with representative
   pending, submitted, approved, refunded, fully credit-funded and legacy rows.
   The local data-bearing upgrade tests are synthetic, not a production restore.
3. Reconcile historical credit against bank/provider records and ownership
   changes before accepting the backfill. `0017` captures the **current owner at
   migration time** for old holds; it cannot recover an unknown former owner.
   Historical failed/rejected/refunded rows are treated as already restored;
   migration does not mint credit to repair possible earlier discrepancies.
   Malformed/noninteger legacy metadata is conservatively treated as no credit.
4. Coordinate write traffic: old application code separately spends/restores
   credit and grants entitlements, while new triggers own those effects. **Never
   leave an old writer running after the new triggers are installed.** Establish
   a verified maintenance/write-quiescence plan or reviewed compatible bridge
   before migration, including inbound webhooks and scheduled jobs.
5. Apply the migrations and compatible Worker as a coordinated release, then
   verify strict readiness, both cron schedules, receipts and admin health.
   A Worker-only rollback to the pre-trigger version is **unsafe**. Do not drop
   triggers or reverse money data as an improvised rollback.
6. Restore full snapshots only with an explicitly rehearsed import plan. Do not
   import payment/business rows into a live schema with business-effect triggers
   active: imports can be rejected or replay effects. Verify counts, balances,
   original credit ownership, notification keys, access and migration history.

### Financial behavior and operational boundaries

- Approval commits status, paid access, audit, in-app receipt and activation
  ledger together. Trigger failure rolls the entire financial statement back.
- Distinct overlapping first-time payments retain both purchased periods, including
  a full-credit activation while an earlier bank proof is under review. Billing
  approval does not reinstate a suspended store; moderation remains separate.
- New plan intents reserve platform credit atomically. Add-ons do not consume
  referral credit. Full-credit plans record **zero cash**, not a cash collection.
- Terminal holds return once to the captured original user. Rejection/refund
  notices, settlement ledger and refunded add-on expiry are transactional.
- Refund is an **operator-confirmed local record**, not provider refund execution.
  No cash is moved by marking refunded. Subscription access is not automatically
  revoked; review the separate entitlement decision and financial evidence.
- Referral rewards use the captured purchase price, not a later plan edit. Their
  credit balance changes and in-app notices commit together. Abuse/economic
  acceptance of credit-funded rewards remains a finance/security release gate.
- A pending hosted Paystack plan intent blocks another plan checkout (409).
  Hourly abandonment expires bank drafts only. Initialization timeout can leave
  an unresolved hosted intent and held credit. Inspect authoritative provider
  state; **do not manually invalidate/recreate it blindly**. Saved hosted checkout verification/resume is implemented behind migration 0019
  (see below); actual provider reuse/finality acceptance and cancellation
  without a saved checkout capability remain open (R10.29).
- Legacy fully credit-funded rows may still carry the old gross `payments.amount`.
  Receipt cash is derived from captured gross less credit; historical admin
  revenue/export totals still require explicit finance reconciliation. No silent
  historical cash rewrite is performed by this migration.

### Queues, retry and diagnosis

- Two-minute cron retries activation/settlement follow-ups, then mail. Each
  payment sweep handles at most ten rows, rotates attempts fairly and isolates
  per-row failures. It does not grant paid access again.
- Admin → Health shows at most the oldest thirty pending payment follow-ups,
  mail metadata/dead letters, and the latest twenty hourly runs. These are
  bounded diagnostic lists, not complete audit exports. No mail body, address or
  reset token appears in the queue view.
- Pending payment follow-ups and queued/dead mail older than ten minutes trigger
  hourly-rule alerts with a one-hour cooldown. External cron-silence and inbox
  monitoring are still required; an in-app warning cannot prove the alert reached
  someone while the app/provider is down.
- `sendEmail=true` means **durably queued**, not inbox-delivered. Authenticated
  enqueue failures return 503; public recovery remains enumeration-resistant.
- Mail retries at most eight times with bounded backoff. Provider idempotency
  uses a stable intent key; confirm custom endpoint support. Delivery is not
  guaranteed exactly-once. Provider acceptance is not bounce/delivery evidence.
- User-bound verification mail expires after 23h; reset mail after 3540 seconds
  (inside the one-hour reset-token lifetime). Dispatch rechecks account status,
  address and preferences. Replay preserves identity and original expiry;
  expired or terminally scrubbed security messages cannot be replayed.
- Ciphertext is erased when sent/cancelled/expired; terminal queue metadata is
  pruned after seven days. Unexpired dead-letter payloads remain encrypted for
  eligible replay. Do not change `MAIL_OUTBOX_KEY` with pending ciphertext:
  there is no multi-key rotation implementation yet. Drain or follow a reviewed
  rotation/migration drill, preserving independently stored recovery custody.

## XML sitemap rollout

Next serves force-dynamic raw XML proxy routes; Worker generates an index and
1,000-ID-range shards with active/published/unpaused filtering. D1 and regional
cache retain snapshots: fresh for 300 seconds, stale allowed up to one hour,
then explicit 503 with `Retry-After: 120`. An outage can expose recently withdrawn
URLs until stale expiry; accept that policy or tighten it before release.
There is no silent home-only inventory fallback. Verify actual proxy/cache
headers, cold-start outage behavior and crawler access in staging. Local tests
and a warning-free build do not establish live SEO availability.


## Media integrity migration 0018: coordinated cutover

This section extends the scoped-token rollout above. The upgraded PHP gateway,
Worker and web client must move together; protocol compatibility has not been
proven on production hosting. Run the native-PHP CI and real
PHP→Worker→isolated-D1 suite on the release source first.

1. Obtain the owner's release window and tested backup/restore evidence. Stop
   new upload starts using an operator-controlled maintenance mechanism and
   allow in-flight 10-minute upload tokens to expire. No new maintenance switch
   is supplied by this migration; do not assume one exists.
2. Verify the PHP host has GD support for the supported formats and sufficient
   memory for the accepted 16-megapixel/10,000-pixel-edge image ceiling. PHP
   rejects oversized dimensions before full decode and rejects missing GD or
   failed decode rather than trusting caller metadata.
3. Apply migration `0018_media_integrity.sql` to the intended database using the
   protected migration process. It adds a nullable upload-token claim and unique
   index. Existing media rows are retained; no receipt is retroactively invented.
4. Deploy the receipt-producing PHP gateway, updated Worker and updated web
   client while uploads remain paused. Use the same approved `GATEWAY_SECRET`
   on the Worker and PHP host; do not put it in a web environment or browser.
   Configure exact allowed origins and the existing scoped folder authorization.
5. Test a non-sensitive synthetic image through the real web→Worker token→PHP
   write→Worker registration flow. Verify the delivered file's bytes/dimensions,
   receipt replay denial, cross-tenant denial, quota failure and error cleanup.
   A receipt binds the normalized file digest, type, size, dimensions, business,
   path and token; successful receipt registration and token consumption are an
   atomic D1 transaction. A local test does not establish Apache permissions.
6. Only reopen uploads after the actual hosted path passes. Monitor unsigned or
   expired receipt errors from old tabs; tell users to reload and retry. Older
   clients without a receipt must fail closed, not silently downgrade integrity.

Files written by PHP but not registered after network/DB failure can remain on
the media host. Neither this migration nor PHP exclusive-write protection is an
orphan-file deletion service. Reconcile against D1 with an approved dry-run,
retention and recovery plan before any destructive cleanup. The unique claim
prevents duplicate registration, not unauthorized filesystem access.

A Worker-only rollback to old unverified registration code weakens integrity;
do not do it while uploads are open. Keep the coordinated versions or pause
uploads and use an owner-reviewed recovery plan. Never drop migration columns
or unique constraints as a casual rollback.

## Hosted checkout migration 0019: private recovery capabilities

Apply `0019_hosted_checkout_recovery.sql` before serving the upgraded Worker.
It creates private `payment_checkouts` storage; do not include this table's
checkout URLs in public listings, receipts, support exports or logs. Protect it
in database backups with the same access controls as other payment data.

- New successful hosted initialization saves a strictly validated provider URL.
  Existing pending rows are deliberately **not backfilled** from guesses.
- The owning vendor (or authorized staff) can check an existing intent using
  `POST /api/vendor/payments/:id/recover`. Server verification checks the exact
  reference, NGN and cash amount before any approved state or saved URL is
  returned. Restricted-store users may recover their existing payment; this
  does not reinstate moderation-suspended stores.
- Approval follows the existing atomic activation path. A provider's explicitly
  terminal failure releases a held credit balance once. Timeout, malformed
  response and amount/reference mismatch do not return a checkout URL or
  silently release credit; mismatches need finance review. Actual Paystack
  finality and eventual-settlement policy must be confirmed in test mode.
- Pending/processing status may return the **same** saved checkout while it is
  under the local 24-hour reuse bound. This bound is **not a claim about the
  provider's checkout expiration or reuse guarantee**. Recovery never creates
  a replacement provider initialization.
- Missing/old saved capability or initialization timeout remains a support and
  authoritative-provider reconciliation case. Do not instruct a vendor to pay
  again, mark failed or manually release holds merely because no URL exists.
- The billing UI separates bank-transfer proof from hosted payment recovery and
  tells a fully credit-funded vendor no cash is due. Verify those exact states,
  webhooks racing a return, tab reloads and actual provider cancellation on
  staging before accepting the checkout work package.

No real provider payment, remote migration or hosted cutover was executed in
this implementation pass. Android association/signing has a separate owner
identity gate in `android/README.md`; backend/web rollout must not invent a
release certificate to make the TWA appear verified.


## Observed preview isolation gate — 2026-10-22

Read-only connected-project metadata for `cybershop-web` shows automatic Git
preview builds are enabled. The branch's frontend preview built successfully,
but single `WORKER_URL` and `WORKER_INTERNAL_SECRET` variable records target both
preview and production. No values were decrypted and no live backend was probed.
This is not evidence of isolated staging; do not run mutating acceptance tests on
the preview until independent test backend/database/media/mail/provider targets
are confirmed. Do not copy production secrets to make a preview pass. The project
Node setting is 24.x while the recorded local/CI toolchain is 22; agree supported
runtime parity before acceptance. Confirm actual canonical origins (production
alias inventory includes `shop.freegameplay.site`) rather than treating the
provisional TWA `cybershop.ng` default as approved ownership. No Vercel settings,
secrets, domains or production deployment were changed during this inspection.
