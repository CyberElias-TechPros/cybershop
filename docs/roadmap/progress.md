# Implementation progress

**Updated:** 2026-10-22 · **Branch:** `arena/2cf4ee33-cybershop`

This log distinguishes **repository implementation**, **local verification** and **production acceptance**. The [main roadmap](../implementation-roadmap.md) and [task register](tasks.csv) remain authoritative for remaining work. No roadmap-wide completion or production-readiness claim is made.

## Batch 3 — receipt-backed media, checkout recovery and selected Android implementation

**State:** implementation committed/pushed; full API regression, production web
build, expanded browser checks and an actual branch Android build/unit/lint CI
have passed. No production deployment or release signing.
User selected TWA in the Android architecture clarification (D-019).

| Work | Purpose / connections | Evidence and honest boundary |
|---|---|---|
| Signed post-write media receipts | Bind actual PHP-normalized bytes/path/MIME/dimensions/SHA-256 to the upload/business/expiry; browser metadata cannot fabricate a stored file | Actual PHP → Worker → D1 suite: 7 PASS; synthetic Worker-only contract: 30 PASS with flows |
| Atomic media registration | Consume the token and insert media in one D1 batch; prevent replay and recover insert failure | Actual concurrent finalize, forged/copied receipt, failed-insert retry and signed-file quota competition tests |
| Storage accounting | Gateway and D1 inserts compare current stored-byte totals atomically using the resolved request quota | Gateway concurrency covered; simultaneous plan/add-on limit changes and broader storage lifecycle still need acceptance |
| Image writer | Bound header dimensions/pixels before GD; fail closed on decode/normalization failure; exclusive create/partial-write cleanup | 17 actual PHP HTTP tests PASS using explicit PHP 8.5 WASM fallback; native PHP 8.2/8.4 CI jobs also passed in run 39773920769; not Apache/cPanel certification |
| Hosted recovery | Privately save validated checkout URLs; owned check/resume verifies status, amount and safely reuses the same capability; no automatic replacement initialization | 7 real-D1 recovery tests PASS with synthetic authoritative responses; actual sandbox finality/reuse contract remains open |
| Billing feedback | Add check/resume/support guidance; fully credit-funded success does not request bank proof; bank-only proof banner | Web typecheck/build PASS; 12 browser checks PASS, including same-checkout check/resume, no bank-proof prompt and one approved intent after simulated completion |
| Android project | TWA selected by user; exact-origin/intent filter, no JS bridge, pinned Gradle/SDK/Browser Helper, debug identity and release-signing guard | Android CI job 119808337414 passed testDebugUnitTest, lintDebug and assembleDebug on source 0edc101; isolated debug APK retained seven days; no physical-device/store proof |
| Domain association | Runtime-configured real package/certificate JSON; 503/no-store when absent; no production debug association | 41 Node safeguards/association tests PASS; real certificate/HTTPS/on-device association still missing |

**Rollout:** migration 0018 plus coordinated new PHP/Worker/web clients is
required. Old clients without a signed receipt are intentionally rejected.
Migration 0019 stores private checkout capabilities; existing unknown/old
checkouts still require support/provider reconciliation. There is no guessed
URL, automatic reinitialization or cancellation based on a timeout.

**External gates remain:** confirmed existing Galaxy package/signing lineage,
release-key custody, physical Android/Samsung/TalkBack checks, current
store/payment/privacy policy review, actual provider/DNS/hosting acceptance and
full restore/production release authorization. Internal source is not a store
submission or legal/financial approval. See android/README.md and the release
runbook; never paste credentials in chat or Git.

### Verification closure — 2026-10-22

**Final runtime-source verification:** [CI run 39774901322](https://github.com/CyberElias-TechPros/cybershop/actions/runs/39774901322)
passed **all seven jobs** for `8d3c88bde2cb80559f059881230ff1671b033866`, including
the expanded 12-browser-case suite. Android job `119811266101` also passed
APK checksum/public-certificate capture and the explicit unapproved-release
request denial check. [Internal candidate artifact](https://github.com/CyberElias-TechPros/cybershop/actions/runs/39774901322/artifacts/12423942313)
is retained seven days; no production release identity or distribution approval
is implied. The following later edits only record evidence and external blockers.

**Read-only hosting inspection:** the connected Vercel project's existing Git
integration automatically built a preview of `8d3c88b`; deployment
`dpl_3xTRiZ4kF8gtBZrYFKGNrYVbYRKo` reports READY/STAGED. No explicit deployment,
domain change, secret update, provider charge or database migration was performed.
A successful frontend build does **not** make this an accepted isolated staging
stack: metadata shows `WORKER_URL` and `WORKER_INTERNAL_SECRET` records both target
production **and** preview. Values were not decrypted and live reachability was
not probed. Do not create accounts, upload private files or simulate payments on
that preview until an independent staging backend/media/mail and test-mode
provider configuration have been proven. Local browser tests use isolated D1.
The project setting is Node 24.x versus local/CI Node 22; runtime-policy parity
also needs review. Production alias inventory includes `shop.freegameplay.site`,
whereas `cybershop.ng` remains the provisional TWA default; confirm the intended
canonical HTTPS origin and association before release. No domain was added or
substituted. See R04.04/R04.06/R06.09 for the unaccepted gates.


- Full Worker suite: **327 PASS / 34 files, 260.60 seconds**. The real PHP
  receipt suite ran using the explicit WASM command in this sandbox; no hidden
  skip or production state was used.
- Expanded browser suite: **12 PASS / 1.4 minutes**, across desktop Chromium and
  Pixel-7-sized Chromium. Added check/resume/completion flow is explicitly
  **development-only simulation**, not provider sandbox or physical Android.
  Its first run exposed an ambiguous test locator (two valid status regions);
  scoping to payment feedback corrected the test. No application fault was hidden.
- Node safeguards: **41 PASS / 0 skipped**. Worker/web typechecks, standalone
  production web build, interactive nesting audit, 29.2-KB/32-KB route CSS budget,
  both npm audits (zero findings) and production Worker bundle dry-run passed.
- [Actual branch CI run 39773920769](https://github.com/CyberElias-TechPros/cybershop/actions/runs/39773920769)
  completed **7/7 jobs successfully** on source
  `0edc101adb55b5a864df2dd366bf3c2c656cccec`. It includes native PHP 8.2/8.4,
  Worker tests, web build, original 10 browser checks, release safeguards and
  Android debug compilation/unit tests/lint. The initial SDK-setup failure in
  run 39773668904 was before compilation; using the Ubuntu-24.04 runner's
  preinstalled SDK fixed that setup and the next actual build passed.
- [Internal Android artifact](https://github.com/CyberElias-TechPros/cybershop/actions/runs/39773920769/artifacts/12422994572)
  is a seven-day debug candidate, **not a release-signed or approved binary**.
  CI now also records its source/checksum/public signer metadata and contains
  an explicit unsigned-release denial regression. Those added steps' outcomes
  belong to the subsequent exact-source CI run, not the older run above.
- Added defect form and contribution/PR review requirements; YAML parsed and
  required field IDs/uniqueness checked. These do not provision actual reviewers,
  branch protection, a private vulnerability intake or a staffed support SLA.
- Added coordinated migration 0018 PHP/Worker/web cutover and migration 0019
  capability/privacy/reconciliation instructions to the release runbook.

**Provenance:** sandbox Node `22.22.3`, npm `10.9.8`; verification recorded
2026-10-22 UTC (local Lagos UTC+1). API/runtime source matches commit `0edc101`;
the expanded 12-case browser suite ran the later working-tree test addition
without runtime-source changes. Final pushed source and check results are
immutable in the GitHub CI commit/run links. Lockfile SHA-256 values:

```text
worker/package-lock.json 432c4d47fafe2d15d837b6b5da24a5e52ba8aec7d1afc35415af2df87720631c
web/package-lock.json    1a2caba198e98fbe22c007e9dc769c5581e6ce99c8530bf7d3464f9af9e8b1ea
Gradle wrapper JAR       3dc39ad650d40f6c029bd8ff605c6d95865d657dbfdeacdb079db0ddfffedf9f
```

Commands: `npm test` (Worker, with explicit `GATEWAY_TEST_PHP` fallback);
`npm run test:e2e` and `npm run build` (web, sequentially);
`npm run typecheck` (each package); `node --test scripts/tests/*.test.mjs`;
`node scripts/web-audit/{jsx-nesting,css-budget}.mjs web` (each audit separately);
`npm audit --audit-level=moderate` (each package);
`wrangler deploy --env production --dry-run` (Worker only, **no deployment**).
CI Android command: `./gradlew --no-daemon testDebugUnitTest lintDebug assembleDebug`.
No earlier historical batch's pending/absent implementation statement overrides
this dated verification closure.

## Batch 2 — durable operations, browser journeys and atomic payments

**State:** implemented and locally verified on 2026-10-22. **Not remotely deployed.**
No live provider transaction, inbox delivery, production restore or Android
artifact/store approval is claimed. Work remains on the session branch.

### What was implemented and why

| Area | Completed repository work | Intended result / connections |
|---|---|---|
| Durable email | Encrypted D1 outbox; stable intent/provider keys; claimed/fenced dispatch; bounded backoff; expiry/dead-letter/replay | Preserve critical intent through provider failure; connects mail adapters, notifications, two-minute cron and Admin Health |
| Mail security and truthful UX | Independent hosted `MAIL_OUTBOX_KEY`; escaped titles/CTA/staff names; user-bound security TTL; dispatch preference/account/address rechecks; queued-not-delivered responses | Avoid stale/private mail leaks and false delivery claims; authenticated enqueue failures return 503 |
| Factor removal and enrolment | Password + unused factor required to disable 2FA; local QR generation, no external secret-bearing QR request | Protect accounts from stolen sessions and remove QR disclosure boundary; connects account/security and browser tests |
| Paid activation | Migration 0016 atomically commits approved status, subscription/add-on, audit, in-app receipt and durable activation ledger | No approved payment without purchased access; conditional updates serialize duplicate confirmations/approvals |
| Credit holds | Migration 0017 captures original credit owner, gross and applied credit; reserves/returns within the intent/status transaction | Prevent split-write credit loss, over-restoration and ownership redirection; add-ons never consume plan-only credit |
| Activation/review/moderation edges | Distinct concurrent initial payments retain both periods; a full-credit payment during bank review activates correctly; existing payment approval never lifts moderation suspension | Preserve purchased time and keep safety decisions separate from billing; nine real-D1 activation tests |
| Cash accounting | Fully credit-funded plans record zero cash; owned receipts distinguish gross, applied/returned credit and cash | Platform discount is not collected money; legacy reporting exceptions require operator reconciliation |
| Terminal effects | Rejection/refund receipt, audit, hold return and refunded add-on expiry commit together; durable settlement ledger retries post-commit work | Roll back all terminal effects on injected failure; do not represent local marking as provider cash refund execution |
| Referral durability | Reward uses captured purchase price; reward/reversal credit and in-app explanation commit together | Catalogue edits and notice-write crashes cannot alter or hide reward balances |
| Hosted checkout protection | Concurrent pending hosted plan attempts get 409; replacement/abandonment limited to eligible unpaid bank drafts | Do not invalidate a provider checkout that could still take real money; hosted timeout resume/reconciliation remains open |
| Follow-up monitoring | Fair attempt rotation, per-row isolation, bounded admin-only pending list and >10min aging rule with 1h cooldown | Stuck mail cannot starve newer credit work; financial effects are never replayed to fix email |
| Scheduled operations | Owned expiring hourly lease; durable run history; sanitized errors; two-minute payment/outbox sweeps | Prevent overlapping hourly work and diagnose failures; external cron-silence monitoring is still required |
| Sitemap resilience | Raw XML Next proxy/index/shards; D1/regional last-good snapshots; visibility filters, XML escaping, age/capacity bounds, explicit 503 | No home-only success on cold/outage; stale policy is 300s fresh / at most 3600s stale, then retryable failure |
| Real browser tests | Owned isolated Next/Worker/D1 stack; four real-form journeys on desktop and Pixel 7 viewport; zero retries, normal clicks | Verify hydration/navigation, signup/free activation, local QR/recovery sign-in, reset/replay and protected-route boundaries; not Android-device acceptance |
| UI stability | Hide the React-owned intro instead of removing its DOM; stop magnetic target translation | Avoid reconciliation failures and moving click targets without forcing interactions in tests |
| Data-bearing upgrade tests | Harness can pause before a migration, seed historical synthetic rows, then resume real local D1 migration | Verify conservative backfill, no approval replay, one-time restoration and malformed metadata handling |

### Current-source verification

| Check / reproducible command | Observed result / boundary |
|---|---|
| `npm --prefix worker run typecheck` | PASS |
| `npm --prefix web run typecheck` | PASS |
| `npm --prefix worker test` | **313 PASS, 32 files, 258.50s**, exit 0; real local D1 integration plus unit tests |
| `npm --prefix web run test:e2e` | **8 PASS, 1.9min**, exit 0; desktop + Pixel 7 Chromium viewport, one worker, zero retries; actual forms/isolated stack |
| `npm --prefix web run build` | PASS, Next.js 15.5.28; XML routes are dynamic; no sitemap dynamic-render fallback warning in this build |
| `node --test scripts/tests/*.test.mjs` | **28 PASS**, exit 0 |
| `node scripts/web-audit/jsx-nesting.mjs web` | PASS; **180 files** scanned |
| `node scripts/web-audit/css-budget.mjs web` | PASS; **29.2KB gzip** shared CSS / 32KB budget; 101 routes measured |
| `npm --prefix worker audit --audit-level=moderate` and web equivalent | **0 vulnerabilities** reported in each complete dependency tree; point-in-time registry result, not certification |
| `PRODUCTION_WORKER_URL=<checked-in HTTPS origin> node scripts/check-production-config.mjs` | PASS static config only; no remote secret inventory, ownership or actual readiness proof |
| `cd worker && npx wrangler deploy --env production --dry-run --outdir .wrangler/release-dry-run` | PASS production bundle/binding inspection; **no deployment** |
| `python3 scripts/check-roadmap.py`; `git diff --check` | PASS; stable task IDs, CSV/checklist/evidence metadata and local links match |

The first expanded full run had **303 pass / 2 fail**: D1 required explicit
result-column aliases in a new compound health query. A minimal real-D1
reproduction exposed the error, the query was corrected, and focused tests
passed before a complete 310-test rerun. The final edge-case review then added
three overlapping-activation/review/suspension regressions and fixes; all
**313 tests** passed in the final complete rerun above. The parallel final
browser run also passed all eight journeys. Nothing was skipped or
quarantined to obtain the final result. The data-bearing migration pack has
3 tests; the new credit/settlement pack has 10 tests. Browser launch flags avoid
costly GPU initialization; browser traces are retained on failure using
synthetic accounts only.

### Compatibility and unfinished boundaries

Read [release-safety.md](../operations/release-safety.md#durable-mail-and-payment-rollout--2026-10-22)
for the rollout steps. **The old application writer is incompatible with the
new credit/entitlement triggers**: quiesce writes/webhooks/schedules or establish
a reviewed compatible bridge; a blind Worker-only rollback is unsafe. Restore
imports must not replay business-effect triggers. Local legacy fixtures are not
an actual full backup/restore drill.

- Historical hold ownership is inferred from current ownership at migration;
  already-terminal rows are not credited again. Finance must reconcile legacy
  discrepancies and old full-credit revenue/export values explicitly.
- Pending hosted initialization timeout may leave a checkout/credit hold requiring
  authoritative reconciliation. Safe resume/cancel UX is not implemented.
- Credit-funded referral economics, multi-account abuse, bank evidence,
  tax/receipt treatment and provider refund authority remain unaccepted.
- Queue acceptance is not inbox delivery/bounce handling. Custom endpoint
  idempotency, DNS/provider acceptance and a key-rotation drill remain open.
- Per-row payment retries do not provide full per-job hourly checkpointing or
  external outage/cron-silence alerts. Ten-row sweeps need staging load/capacity
  acceptance; bounded health lists are not complete exports.
- Sitemap stale snapshots can contain recently withdrawn URLs for at most one
  hour during an outage. The operating policy needs production acceptance.
- Browser coverage does not yet include the full catalogue/upload/staff/buyer/
  admin/payment/a11y matrix. Device emulation is **not** a Samsung/TalkBack,
  physical-device, native Android or store acceptance result.
- No Android project/signing/binary, platform migration/deployment, real charge,
  inbox evidence, commit/push or store submission was performed in this batch.

## Batch 1 — release safety, payments, authentication, media and dependency security

### Implemented

| Area | Change | Task coverage / evidence |
|---|---|---|
| Production environment | Explicit production D1 binding, APP_ENV, secure cookies, nonmock payments, admin 2FA and explicit cron configuration | R06; `worker/wrangler.jsonc`; dry-run binding inspection |
| Release gating | Deploy waits for reusable exact-commit web/Worker/release-tool/PHP CI; main-only serialized job targets production environment | R06.01/R06.12; workflow source tests; actual protected-environment configuration still external |
| Config/readiness | Static profile/secret-name checks; runtime HTTPS/key-mode/provider/sender checks; separate no-store /readyz with D1 and release SHA; unsafe hosted operations return 503 | R06.05–R06.08; envcheck/readiness and Node release-tool tests |
| Recovery preparation | Encrypted pre-migration SQL artifact uploaded before migrations; explicit production environment for backup/migrate/deploy | R06.03/R06.13 partial; actual backup/restore drill still open |
| Paystack checkout | Correct authorization_url field, restricted HTTPS checkout origin, reference validation, integer-kobo input, timeout and sanitized errors | R10.03–R10.04; published OpenAPI review and synthetic contract tests |
| Payment verification | Require matching reference, NGN and whole-kobo amount; exact local amount equality; do not permanently fail pending confirmations | R10.05 partial; live money, concurrency and full lifecycle acceptance still open |
| Webhook boundary | Independent HMAC tests; only exact charge.success event accepted; hosted mock callbacks refused | R10.06; signature regression tests |
| Test isolation | Per-suite temporary config, local D1 and random port; no .dev.vars reads/writes, no arbitrary listener killing; removed unawaited port check | R25.02–R25.04; full integration-suite runs |
| Scheduled work | Actual scheduled handler now invokes/awaits hourly jobs and emits sanitized completion/failure timing | R27.17; handler unit tests; overlap locking and external monitoring remain open |
| PHP config | Fixed constants/variables mismatch; fail closed for incomplete/placeholder config | R11.17; actual PHP HTTP tests |
| Browser upload | Exact-origin CORS/preflight; no cookie-dependent wildcard access | R11.18; actual HTTP tests |
| Upload scope | Signed exact folder in token and enforced by PHP; longer bounded token validation; suspended/unwritable business checked again at finalize | R11.19/R11.21; Worker and PHP regression tests |
| Image handling | WebP decoding uses byte-string API instead of filename API | R11.20; syntax/runtime regression; comprehensive GD/EXIF/variant coverage remains open |
| Secret hygiene | Gateway config, environment variants, keystores and packaged mobile artifacts excluded from Git; Apache rules deny config/tooling/backup files | R08.15/R11.06; Git ignore checks; Apache host enforcement still needs testing |
| 2FA recovery/replay | Fixed nondeterministic recovery-code classification and atomic TOTP/recovery consumption; deterministic input and concurrent-challenge regression tests | R07.14–R07.15; an intermittent full-run failure led to this fix, not a test skip |
| Dependency security | Updated Hono/Next/sharp; pinned patched PostCSS/source-map-js; removed unused Cloudflare test pool; migrated test tooling to Vitest 5 and updated Wrangler; CI audit gate | R08.16; full audits show zero reported advisories in both packages |
| Buyer-money safety | Default-off real deposit creation and related add-on sale; public deposit CTA hidden; existing settlement/records remain accessible | R03.05; 5 dedicated gate tests plus local mock premium integration |
| Real PHP tests | Added HTTP upload/serve/security suite and CI PHP 8.2/8.4 jobs | R11.13/R25.17; local PHP 8.5 WASM execution, not an Apache/cPanel certification |

### Verification

| Check | Result / boundary |
|---|---|
| Worker typecheck | PASS |
| Full dependency audits | Zero reported vulnerabilities in web and Worker (including dev dependencies), checked after updates; point-in-time registry evidence, not a security certification |
| Complete Worker suite | **258 PASS across 26 files**, 142.52s, Vitest 5.0.5; exact current code/dependencies, exit code 0 |
| Release-tool Node tests | 28 PASS |
| Actual PHP HTTP tests | 15 PASS using PHP 8.5.10 WASM runtime; native PHP 8.2/8.4 CI configured but not executed on GitHub in this pass |
| Web typecheck and production build | PASS; existing sitemap dynamic-render fallback warning remains tracked in R23 |
| Interactive-nesting audit | PASS; 175 files scanned |
| CSS budget | PASS; 29.2KB gzip shared CSS against 32KB gate |
| Production Worker dry run | PASS; explicit production DB/vars bundled; no remote deployment |
| Secret/signing ignore patterns | PASS using git check-ignore on representative paths |
| Workflow validation | Source-level invariants tested locally; GitHub Actions execution/approval remains unverified |

The initial full-suite baseline was 155 tests/435.57 seconds. A later run exposed an intermittent recovery-code failure; it was fixed with input classification and atomic claims, then the complete 253-test suite passed before the dependency updates. An intermediate expanded run passed 236 tests/145.37 seconds. Most improvement comes from removing incorrect port-free waits and replacing repeated global cleanup with owned test state; these timings are observations, not a performance SLA.

### Deployment/compatibility notes

Read [release-safety.md](../operations/release-safety.md) before any live rollout. In particular:

- Naming a GitHub production environment does not configure its required reviewers; the owner must do that.
- The intended database ID and webhook host come from existing checked-in configuration/workflow, not authorized remote inspection. Confirm ownership before release.
- Runtime readiness now intentionally refuses incomplete hosted configuration. Mail/sender and admin 2FA must be provisioned/enrolled before promotion.
- Failure after migration/deployment fails CI but is **not automatic rollback**. Restore and backward compatibility remain release gates.
- PHP and Worker scoped-token changes need coordinated rollout; old 10-minute tokens are rejected by new PHP. Existing gateway config must add ALLOWED_ORIGINS.
- Audio currently has a D1 upload path; gateway remains image-only. Accept/document the hybrid storage/capacity model or implement a different approved media design rather than claiming parity already exists.

## Remaining work — not completed or silently waived

### Next repository implementation priorities

1. Safe hosted-checkout recovery/reconciliation after initialization timeout, with authoritative synthetic/sandbox fixtures and explicit cancellation boundaries (R10.29).
2. Full Worker→PHP→finalize trust, private-file/audio driver parity, quota lifecycle and safe image decode/variants (R11/R12).
3. Extend browser journeys to catalogue/media, discovery/WhatsApp, buyer data rights, staff permissions, admin review and accessibility failure paths (R25/R22).
4. Add bounded/checkpointed hourly sweeps, external failure/cron-silence integration and an isolated full restore/compatible rollback rehearsal (R27/R10.32).
5. Rehearse real provider/DNS mail acceptance, custom endpoint idempotency and independent outbox-key rotation (R21).
6. Complete audience/low-data/accessibility validation and the selected TWA client's physical-device/store acceptance track (R02/R03/R29–R34).

### Owner/external evidence needed

| Dependency | Why it cannot be marked done from repository code |
|---|---|
| Named owners, launch cities/categories and user research/pilot | Requires real audience/business decisions and recruitment |
| Intended staging/live resource ownership, protected environments and secrets | Requires authorized platform configuration/inspection; no secrets should be sent in chat |
| Paystack sandbox/live acceptance, approved low-value charge/refund | Requires configured provider account and explicit live-test authorization/budget |
| Legal/financial deposit scope and store purchase rules | Requires approved money responsibilities and current channel-policy assessment |
| cPanel/Apache/GD and full media/backup restore | Requires actual target host and isolated restore environment |
| Delivered real email and support rota | Requires verified DNS/provider and staffed operations |
| Android signing custody, developer accounts and physical devices | TWA route is selected; confirmed package/ownership/device evidence is still required before release packaging and review |
| Store approval/publication | Only an actual channel review result establishes acceptance |

The register currently has **535 tasks**: **43 locally verified checkpoints**, **67 existing/implemented-code checkpoints**, and **425 unaccepted actions**. A code checkpoint is not production approval. Batch 2 appended 32 narrowly scoped implementation/risk checkpoints and retained broader provider, finance, device and production acceptance tasks as open. Historical tasks were not deleted to inflate completion.


## User clarification — Android origin and existing app update (2026-10-22)

User selected `https://shop.freegameplay.site` and **preserve the existing store
listing**, superseding the provisional Android launch origin noted above. The
launcher default and Java link-policy tests now use that origin. Digital Asset
Links also deny debug identities on this confirmed production host, even when
misconfigured as staging. Release requires explicit existing package ID and
version properties; it cannot silently use the internal placeholder identity.
The public package ID, actual distributed signing certificate/lineage and highest
published version still require owner evidence. No domain, secret or store
configuration was changed. Previous CI evidence applies to the preceding source;
the origin/signing-gate update needs its own exact-commit CI result.
