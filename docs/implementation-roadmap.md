# CyberShop: Web + Android implementation roadmap

**Baseline date:** 2026-10-21 · **Baseline commit:** `f1cb2143ad300d8d0b4a5b2bec15ca084e154ceb` · **Status:** planning and repository verification, not production certification.

> **Purpose:** help buyers find credible businesses and make useful enquiries, primarily on WhatsApp; help vendors maintain catalogues, receive leads and demonstrate value; give operators the controls to run a safe, sustainable marketplace. Android is a requested expansion, not an already-shipped capability.
>
> **Start here:** [immediate next actions](#immediate-next-actions) → [baseline](#what-is-actually-done) → [release gates](#release-gates) → [detailed checklist](#detailed-implementation-checklist). This roadmap tracks delivery. `plan.md` and approved ADRs still define product decisions; conflicts must be resolved explicitly before implementation.

## Tracking rules and definition of done

- **`[x] [VERIFIED]`**: named inspection/local check completed on its recorded evidence date. Not production acceptance.
- **`[x] [CODE]`**: implementation/artifact exists in this checkout. Configuration, completeness and real-user acceptance remain open unless separately evidenced.
- **`[ ] [TODO]`**: not accepted yet; may mean validating/improving existing code, not rebuilding it.
- **P0** blocks the relevant safe release. **P1** is a high-value release requirement unless formally waived. **P2** is evidence-led postlaunch work. “P0 for Android” need not block an otherwise safe web release.
- Stable IDs (`R10.03`) make each step assignable. **Purpose, connections, priority, accountable roles, dependencies and acceptance inherit from its work package.** Add task-level overrides when needed.
- Dependencies identify prerequisite capabilities; they do not require every optional future experiment to finish first. Ranges mean the applicable release-required tasks, settled by the gates.
- Sizes are rough work-package estimates: **S≈1–3, M≈4–8, L≈9–20 engineer-days**, not calendar commitments. Some tasks validate existing code; reviews, recruiting, provider onboarding and store approval add external waiting time. Split L packages before scheduling.
- Suggested task record: `ID | state | named owner | estimate | predecessor | PR/commit | test/evidence | risk | release | acceptance date | reviewer | rollback/notes`. The companion [CSV](roadmap/tasks.csv) supplies importable rows and empty assignment/evidence fields.
- **Done means:** requirement/risk reviewed; implementation and tests pass; permission/privacy/accessibility covered; failure handling/metrics present where relevant; migration/recovery/help updated; dated evidence linked; accountable reviewer accepts.
- Do not mark a feature accepted merely because its code exists. Critical financial, security and data-loss P0 issues cannot be waived for public launch. Other waivers need reason, compensating control, owner and expiry.
- No finite checklist anticipates every future defect, legal change or audience need. Add newly discovered work with new IDs and explicit priority, preserving history.

## What is actually done

**Task-register snapshot:** 535 steps in 35 packages: 43 locally verified checkpoints, 67 existing/implemented-code checkpoints, and 425 unaccepted implementation/validation actions. Updated 2026-10-22; code checkpoints are not production acceptance. See the [implementation progress log](roadmap/progress.md). The baseline verification table below is historical.

### Repository-confirmed implementation

| Capability | Existing evidence | Honest status / remaining boundary |
|---|---|---|
| Public discovery, business/item SSR, metadata | `web/app/` public routes; `worker/src/routes/public*.ts` | Implemented; device, real-user and production acceptance remain open. |
| Buyer auth/account/saves/enquiries/settings | `web/app/account/`; `worker/src/routes/{auth,account}.ts` | Implemented; recovery delivery, data-rights completeness and Android acceptance need testing. |
| Vendor onboarding/catalogue/media/leads/billing | `web/app/{onboarding,dashboard}/`; vendor routes | Implemented; real providers, role matrix and low-end workflows need acceptance. |
| Dynamic fields and plan quotas | validation/quota libraries, vendor/admin routes, migrations | Implemented; concurrency, legacy fields and migration evidence still required. |
| Bank proof, Paystack, reconciliation | payment/Paystack/reconcile libraries and webhook/admin routes | Implemented; mock tests do not establish actual charge/refund/settlement correctness. |
| Teams, roles, business switching, domains, catalogue API | `lib/access.ts`; `routes/catalog-api.ts`; vendor premium/ops routes | Present; do not re-add as missing based on older critiques. |
| Reports/SLA, support, audit, TOTP, sessions | moderation/totp/session libraries; support/admin routes | Present; staffed operation, recovery and external alert delivery are not demonstrated. |
| Growth, alerts and FTS search foundations | migration `0014_platform_growth.sql`; `lib/{growth,search}.ts` | Present; older LIKE-only/no-analytics claims need reconciliation with current code. |
| D1 and PHP media gateway | `lib/media.ts`; `media-gateway/` | Present; actual PHP, private-file and audio parity need production-driver validation. |
| PWA | `web/app/manifest.ts`; `web/public/{sw.js,offline.html}` | Install manifest + navigation-failure fallback, **not** a full offline catalogue/editor. |
| CI, deployment and backups | `.github/workflows/`; `scripts/backup-d1.sh` | Artifacts exist; production environment/release gates have concrete gaps below. |
| Android | User-selected TWA project in `android/`; guarded launcher, pinned build, debug/release gate and configurable assetlinks route | Internal source present; actual build/device/certificate/store acceptance tracked separately. Existing listing identity remains unconfirmed. |
| Galaxy submission materials | `docs/galaxy-store.md`; `store-listing/`; screenshot scripts | Draft guidance/assets, not evidence of an accepted or published Android release. |

### Local verification on 2026-10-21

| Check | Observed result | Limitation |
|---|---|---|
| `cd web && npm ci --no-fund --no-audit && npm run typecheck && npm run build` | PASS; resolved Next.js 15.5.25; compilation and route generation complete | No live backend/device/provider acceptance. Sitemap dynamic-render fallback warning recorded for R23.07. |
| `cd worker && npm ci --no-fund --no-audit && npm run typecheck` | PASS | Does not prove live secrets/bindings/provider access. |
| Worker `npm test` | PASS; **155 tests across 20 files**, 435.57s, exit code 0 | First attempt exceeded the command time limit; the subsequent complete run passed. Local/mock integration evidence only, not live provider acceptance. |
| `node scripts/web-audit/jsx-nesting.mjs web` | PASS; 175 files scanned | Heuristic source check, not screen-reader/DOM acceptance. |
| `node scripts/web-audit/css-budget.mjs web` after build | PASS; 29.2KB gzip shared CSS against 32KB budget | Not total JavaScript/images/page-load performance. |
| Real PHP gateway, browser E2E, physical Android, live payments and deployed configuration | NOT VERIFIED | Not executed or inspected remotely during this planning pass. |

The baseline planning pass installed dependencies from existing lockfiles and did not upgrade packages or change live resources. Subsequent repository implementation and dependency updates are recorded in the [progress log](roadmap/progress.md). No infrastructure deployment, live money movement or store submission has been performed. Provider/store requirements still need verification at implementation/submission time; credentials must never be supplied in chat.

## Highest-priority repository findings (baseline)

The findings below record the initial inspection. Subsequent fixes and remaining acceptance boundaries are tracked in the [progress log](roadmap/progress.md) and updated task register; do not interpret every baseline finding as still unfixed.

| Finding | Why it matters | Implementation home |
|---|---|---|
| Deployment uses unqualified `wrangler deploy`, while live variables are under `env.production`; top-level defaults include insecure cookies and mock payments | A successful deploy can select the wrong profile; actual remote state is unknown | R06.01–R06.08 |
| Documentation assumes production D1 binding inheritance | Wrong/missing binding risks outage or wrong-environment writes; make it explicit and validate | R04.05, R06.02–R06.03 |
| `/healthz` returns top-level `ok:true` even for failing `config.ok`; deploy only greps top-level success | Green deployment is not readiness proof | R06.06–R06.08, R27.02 |
| Backend deploy workflow is independent of the test workflow | Failed tests need not prevent deployment | R06.12 |
| Initialize parser expects `data.authorization.url`; actual Paystack response not validated here | Hosted checkout may fail outside mock mode; compare authoritative fixtures before changing code | R10.02–R10.04 |
| Gateway config accepts images while vendor voice notes exist | Recommended hosting path may reject audio; private proofs/documents also need inspection | R11.02–R11.04 |
| Mail is best-effort and logged no-op without configuration | Recovery/receipts may silently fail; no demonstrated durable retry | R21 |
| Last-good sitemap lives in module memory; cold-start failures fall back to home | Serverless restarts can shrink search inventory unnoticed | R23.06–R23.08 |
| `waitForPortFree` does not await async `isPortOpen` | Incorrect port-free loop, unnecessary delay and unreliable process/state handling | R25.03–R25.04 |
| No-native/no-buyer-payment docs conflict with requested Android and existing premium/deposit paths | Product claims, financial obligations and store policy can diverge | R03, R09, R10.18 |

These are repository observations or explicitly labeled validation risks, **not** a penetration test or a claim that a remote production site is currently broken.

## Dependency map and milestones

```text
0  R01–R03: baseline → audience/outcomes → scope/architecture decision
1  R04–R06: staging isolation → migration integrity → safe deployment
2  R07–R11: auth/permissions/privacy → real payments + media parity
3  R12–R24: low-data buyer/vendor/admin journeys, reliable mail,
           accessibility, SEO and useful measurement
4  R25–R27: consolidated regression + capacity + recovery proof
5  R28: controlled WEB pilot → measured WEB general availability
6  R29–R33: approved Android route → device parity → signing → channel review
7  R34: staged ANDROID release + installed-client/web compatibility
8  R35: ongoing retention, learning, localization and scale
```

Security, QA, accessibility, documentation and observability run throughout; phase 4 is the consolidation gate, not the first test. Android foundations can run alongside web hardening after R03. Android public launch requires accepted backend/web and relevant product gates. Store rejection need not block a safe web-only release.

**Staffing suggestion:** one web/UX stream, one backend/platform stream, one QA/security/operations stream; add Android ownership after R03. Roles can be combined, but acceptance requires named accountable people.

**Scheduling:** use short increments; split packages, estimate actual gaps after staging verification, reserve explicit contingency, and track legal/provider/store waiting separately. Do not sum every rough size into a promised deadline: work overlaps and existing code reduces some tasks.

**Milestones:** M0 scope/Android route; M1 safe staging/deploy; M2 core journey acceptance; M3 recovery/security/money acceptance; M4 web pilot/GA; M5 signed Android candidate + channel approval; M6 Android staged/GA; M7 evidence-led improvement.

## Immediate next actions

1. **R01.04 + R02.01:** appoint accountable owners and choose launch audience/cities/categories.
2. **R06/R04:** validate the corrected explicit profile against owned staging/live bindings, secrets and protected deployment settings; rehearse migrations before rollout.
3. **R03.04–R03.10 + R09.12–R09.13:** settle deposits/money scope and approve Android route/compliant purchase UX.
4. **R04.04–R04.07:** create isolated staging with test providers and no live personal data.
5. **R10.02–R10.09 + R11.02–R11.07:** verify actual Paystack contract and PHP/private/audio media behavior.
6. **R25 + R27:** extend the implemented browser/cron regressions to remaining personas and prove full restore/external alerts, not just local checks.
7. Promote to **R28 web pilot** and approved **R29–R34 Android track** only after relevant gates pass.

## Release gates

| Gate | Evidence required | Stop-release conditions | Sign-off |
|---|---|---|---|
| G0 Scope | Audience, enabled features, money flow, architecture/Android route, exclusions | Unknown payee/liability or contradictory purchase UX | Product + architecture + legal/finance |
| G1 Environments | Isolated staging; explicit live binding/secrets/origins; exact-commit checks; strict readiness | Mock money, insecure cookies, wrong DB, failed checks | Platform + security |
| G2 Core product | Guest enquiry; vendor publish/manage; buyer optional account; staff permissions; admin/support journeys on supported devices | Broken handover/login/publish, cross-tenant leak, blocked core accessibility | QA + product |
| G3 Money/media/mail | Provider fixtures/sandbox; authorized low-value live charge/refund; private-file denial; production image/audio; actual recovery email | False activation/refund, money mismatch, public IDs/proofs, failed recovery | Finance + backend + security |
| G4 Operations | External alerts; tested cron; staffed queues; encrypted off-host D1+media backup and measured full restore; rollback drill | Data-loss risk, unowned complaints, no restore evidence | Operations + support |
| G5 Web | No open P0/critical security issues; required P1 accepted or bounded waiver; pilot targets met | Unsafe fraud/billing/access outcome, no support/rollback | Release + product |
| G6 Android candidate | Approved route/policy, association/links, device parity, reproducible signed artifact, declarations/deletion | Unsafe wrapper, secret exposure, failed handover, noncompliant billing | Android + QA + compliance |
| G7 Android public | Actual channel approval, healthy staged metrics, compatible web, active support/monitoring | Rejection, core crash/ANR, unsafe rollout or web incompatibility | Release + Android |

### Outstanding decisions and external inputs

| Input | Owner to appoint | Needed before | Safe handling |
|---|---|---|---|
| Initial audience/cities/categories and outcome targets | Product | R02/G0 | Interview evidence, not assumptions |
| Intended live resource ownership/domains and budget | Platform/business | R04/R06 | Authorized metadata inspection; no blind D1 recreation |
| Activated Paystack account, bank-review authority, live-test approval | Finance | R10/G3 | Platform secret stores; explicit consent before charges/refunds |
| Actual deposit payee/collection scope | Product + legal/finance | G0/R09 | Default hold until approved |
| cPanel/PHP/GD/private-document capabilities and launch media driver | Platform/security | R11/G3 | Real staging fixtures and host limits |
| Mail DNS/provider and support coverage | Operations | R21/G4 | Actual delivery and staffed escalation |
| Android route, target stores, purchase UX and account ownership | Product/Android/compliance | R29/R33 | Current-policy check, documented decision |
| Signing custody and reviewer access | Release | R32/R33 | Restricted secret/artifact storage, not chat/Git |
| Research/pilot/accessibility review capacity | Product/QA | R22/R28 | Consent and anonymized evidence |

## Detailed implementation checklist

Each package states its **why, intended result, connections, accountable roles, dependencies, effort and acceptance**. These fields apply to every numbered action inside it; the CSV repeats them per task for independent assignment.

### Work-package navigation

| Package | Workstream |
|---|---|
| [R01](#r01) | Truthful baseline and delivery controls |
| [R02](#r02) | Audience, purpose and measurable success |
| [R03](#r03) | Scope and architecture decisions, including Android |
| [R04](#r04) | Reproducible development and isolated staging |
| [R05](#r05) | Database integrity, migrations and lifecycle |
| [R06](#r06) | Fix production configuration and deployment gates |
| [R07](#r07) | Authentication, recovery and sessions |
| [R08](#r08) | Authorization, tenancy and abuse prevention |
| [R09](#r09) | Privacy, legal, financial boundaries and channel policy |
| [R10](#r10) | Payments, activation, refunds and reconciliation |
| [R11](#r11) | Production media, private files and real PHP parity |
| [R12](#r12) | Low-data media and rendering performance |
| [R13](#r13) | Discovery, relevance and location search |
| [R14](#r14) | Storefront trust and WhatsApp conversion |
| [R15](#r15) | Vendor onboarding and first useful catalogue |
| [R16](#r16) | Catalogue maintenance, schemas and bulk workflows |
| [R17](#r17) | Lead pipeline, seller ROI and communication |
| [R18](#r18) | Buyer accounts, saves and useful alerts |
| [R19](#r19) | Teams, business switching, domains and API |
| [R20](#r20) | Admin, trust/safety and support operations |
| [R21](#r21) | Email and durable notification delivery |
| [R22](#r22) | Coherent design, accessibility and responsive usability |
| [R23](#r23) | SEO, sharing, PWA and truthful offline behavior |
| [R24](#r24) | Product analytics, growth and unit economics |
| [R25](#r25) | Automated quality and critical-journey regression |
| [R26](#r26) | Performance, capacity and cost acceptance |
| [R27](#r27) | Monitoring, incident response and complete recovery |
| [R28](#r28) | Web pilot and public release |
| [R29](#r29) | Android project and trusted-origin foundation |
| [R30](#r30) | Android links, Back and external handovers |
| [R31](#r31) | Android permissions, media, lifecycle and offline recovery |
| [R32](#r32) | Android CI, signing, security and device regression |
| [R33](#r33) | Play/Galaxy metadata, declarations and review |
| [R34](#r34) | Android staged rollout and update operations |
| [R35](#r35) | Evidence-led postlaunch improvement and expansion |

<a id="r01"></a>

### R01 — Truthful baseline and delivery controls

**Phase:** 0 · **Priority:** P0 · **Accountable roles:** Product + engineering + QA · **Effort:** S

**Depends on:** None.

**Why / intended outcome:** Separate implemented code from accepted, production-ready capability.

**Uses / connects to:** README; plan.md; decisions; audits; Git; CI.

**Acceptance / deliverable:** Agreed inventory, named owners and evidence-linked tracking.

- [x] **R01.01 [VERIFIED]** Inspect packages, routes, migrations, workflows, tests and existing decisions.
- [x] **R01.02 [VERIFIED]** Run web typecheck and production build; record the sitemap warning separately from build success.
- [x] **R01.03 [VERIFIED]** Run interactive-nesting and production CSS-budget checks; record measured results.
- [ ] **R01.04 [TODO]** Appoint named product, engineering, QA, security, finance, support and release owners.
- [ ] **R01.05 [TODO]** Map existing features to route, automated test, staging evidence and production acceptance.
- [ ] **R01.06 [TODO]** Reconcile each historical audit finding with current code; do not rebuild already-implemented features.
- [ ] **R01.07 [TODO]** Create project-board issues using this roadmap's stable task IDs and dependencies.
- [ ] **R01.08 [TODO]** Record commit, runtime versions, lockfiles and commands for every verification run.
- [x] **R01.09 [VERIFIED]** Create defect template with persona, URL, device, expected/actual result and sanitized repro.
- [x] **R01.10 [CODE]** Define review rules for secrets, tenancy, migrations, tests and sensitive actions.
- [ ] **R01.11 [TODO]** Review status weekly; require dated evidence and a reviewer before acceptance.

<a id="r02"></a>

### R02 — Audience, purpose and measurable success

**Phase:** 0 · **Priority:** P0 · **Accountable roles:** Product + research + commercial · **Effort:** M

**Depends on:** R01.

**Why / intended outcome:** Prioritize real buyer/vendor needs instead of unlimited feature scope.

**Uses / connects to:** Consented interviews; usability sessions; support history if available; metric definitions.

**Acceptance / deliverable:** Launch audience, journeys, targets and exclusions approved.

- [ ] **R02.01 [TODO]** Choose initial cities and two or three categories; validate rather than assume location from this chat.
- [ ] **R02.02 [TODO]** Recruit guest/repeat buyers, solo vendors, service providers, staff and operators in the chosen segments.
- [ ] **R02.03 [TODO]** Interview participants about their last discovery, enquiry, scam concern and catalogue-maintenance experience.
- [ ] **R02.04 [TODO]** Observe phone-only buyers and vendors completing tasks without coaching.
- [ ] **R02.05 [TODO]** Include low-end Android, limited data, unreliable connectivity and accessibility needs.
- [ ] **R02.06 [TODO]** Record language, NGN pricing, service-area, pickup and contact expectations.
- [ ] **R02.07 [TODO]** Map discovery→enquiry and signup→first qualified lead; name failure points at every stage.
- [ ] **R02.08 [TODO]** Define qualified lead; separate link creation, observed handover and seller-reported sale.
- [ ] **R02.09 [TODO]** Agree north star: active vendors receiving qualified enquiries per week, with explicit attribution limits.
- [ ] **R02.10 [TODO]** Set activation, first-listing, zero-result, enquiry-success, renewal and complaint targets.
- [ ] **R02.11 [TODO]** Set safety/data/support counter-metrics and minimum acceptable thresholds.
- [ ] **R02.12 [TODO]** Confirm no mandatory buyer account, no general checkout/escrow and WhatsApp-first scope.
- [ ] **R02.13 [TODO]** Rank research hypotheses; attach an experiment, success criterion and stop condition.

<a id="r03"></a>

### R03 — Scope and architecture decisions, including Android

**Phase:** 0 · **Priority:** P0 · **Accountable roles:** Architecture + product + security · **Effort:** M

**Depends on:** R01, R02.

**Why / intended outcome:** Resolve older no-native/no-buyer-payment statements before expanding the product.

**Uses / connects to:** ADRs D-001–D-018; plan.md; Next.js; Worker; D1; cPanel; Android spike.

**Acceptance / deliverable:** Approved architecture, money-flow boundaries and one Android route.

- [x] **R03.01 [CODE]** Retain existing Next.js, Hono Worker, D1 and MediaService boundaries.
- [ ] **R03.02 [TODO]** Diagram browser→same-origin Next proxy→Worker→D1 and intentionally public exceptions.
- [ ] **R03.03 [TODO]** Map Paystack, email, media, domain API, analytics and advertising data flows.
- [ ] **R03.04 [TODO]** Reconcile deposit/chat/jobs implementations with no-checkout claims; identify actual customer-money recipient.
- [x] **R03.05 [CODE]** Hold deposit collection disabled unless legal, settlement, refunds and reconciliation are approved.
- [ ] **R03.06 [TODO]** Compare TWA/PWA, Capacitor and Kotlin/Compose against device APIs, offline needs, policies, cost and maintenance.
- [ ] **R03.07 [TODO]** Run TWA feasibility spike for origin trust, cookies, uploads, audio, WhatsApp, Paystack return and Back.
- [ ] **R03.08 [TODO]** Recommend TWA only if spike and current channel-policy review pass; otherwise approve one alternative.
- [x] **R03.09 [CODE]** Record Android ADR explicitly superseding earlier exclusion for approved scope only.
- [ ] **R03.10 [TODO]** Decide buyer/vendor/staff parity and whether admin remains web-only initially.
- [ ] **R03.11 [TODO]** Choose launch media driver, capacity limits and migration path.
- [ ] **R03.12 [TODO]** Document non-goals: reading WhatsApp messages, verified sale attribution, escrow and unsupported offline mutations.
- [ ] **R03.13 [TODO]** Review architecture cost, security, accessibility and release implications with accountable owners.
- [x] **R03.14 [VERIFIED]** Record the user-selected Trusted Web Activity architecture and preserve package, signing and channel-policy acceptance as separate gates.


<a id="r04"></a>

### R04 — Reproducible development and isolated staging

**Phase:** 1 · **Priority:** P0 · **Accountable roles:** Platform + engineering · **Effort:** M

**Depends on:** R03.

**Why / intended outcome:** Rehearse safely without production data or credentials.

**Uses / connects to:** bootstrap-dev.sh; env examples; D1; staging cPanel; Vercel previews.

**Acceptance / deliverable:** Fresh clone works; staging has independent resources and safe fixtures.

- [x] **R04.01 [CODE]** Retain bootstrap, environment examples, demo assets and local migration foundations.
- [ ] **R04.02 [TODO]** Pin supported Node/npm; document PHP and route-specific JDK/SDK prerequisites.
- [ ] **R04.03 [TODO]** Rehearse fresh-clone bootstrap and safe repeated execution from lockfiles.
- [ ] **R04.04 [TODO]** Create independent staging Worker, D1, web origin, media directory and email sender/test recipients.
- [ ] **R04.05 [TODO]** Verify Cloudflare environment binding inheritance rather than assuming production shares top-level D1 bindings.
- [ ] **R04.06 [TODO]** Prove staging cannot mutate live D1, media, payments or real recipient lists.
- [ ] **R04.07 [TODO]** Configure Paystack test credentials and labeled references; keep mock mode distinct from sandbox integration.
- [ ] **R04.08 [TODO]** Keep demo accounts in local/staging; remove default credentials from production bootstrap procedures.
- [ ] **R04.09 [TODO]** Confirm browser-facing calls use relative /api URLs and internal secrets remain server-side.
- [ ] **R04.10 [TODO]** Test preview host, cookies and CSRF through the actual preview URL.
- [ ] **R04.11 [TODO]** Provide a PHP gateway runner and sanitized upload fixtures.
- [ ] **R04.12 [TODO]** Document environment access, cost, rotation and teardown without deleting live resources.

<a id="r05"></a>

### R05 — Database integrity, migrations and lifecycle

**Phase:** 1 · **Priority:** P0 · **Accountable roles:** Backend + data engineering · **Effort:** M

**Depends on:** R04.

**Why / intended outcome:** Protect tenant/catalogue/financial state during changes and partial failures.

**Uses / connects to:** worker/migrations/0001–0014; schema.sql; D1; query plans; backup script.

**Acceptance / deliverable:** Migration and critical state-transition tests pass on empty and prior-version state.

- [x] **R05.01 [CODE]** Inventory 14 migrations; treat migrations, not illustrative schema.sql, as runtime truth.
- [ ] **R05.02 [TODO]** Apply all migrations to clean isolated D1 and verify tables, indexes and triggers.
- [ ] **R05.03 [TODO]** Migrate sanitized prior-release state; record failures, execution time and backward compatibility.
- [ ] **R05.04 [TODO]** Check foreign keys, uniqueness, money units, nulls, soft deletion and orphan relationships.
- [ ] **R05.05 [TODO]** Verify FTS creation, backfill and insert/update/delete synchronization on target D1.
- [ ] **R05.06 [TODO]** Audit tenant predicates on listings, media, messages, staff, billing, domains and exports.
- [ ] **R05.07 [TODO]** Specify publication, payment, subscription, moderation and closure state transitions.
- [ ] **R05.08 [TODO]** Test concurrent approval, repeated payment, quota-edge and business-switch mutations.
- [ ] **R05.09 [TODO]** Audit multi-statement writes; use supported batching/transactions or compensating actions.
- [ ] **R05.10 [TODO]** Inspect pagination and query plans at target listing/vendor volume.
- [ ] **R05.11 [TODO]** Define retention for sessions, IP hashes, enquiries, files, audit, money records and backups.
- [ ] **R05.12 [TODO]** Document expand/migrate/contract deployment and safe recovery instead of blind reverse SQL.
- [ ] **R05.13 [TODO]** Align schema documentation with migrations and add practical drift checks.

<a id="r06"></a>

### R06 — Fix production configuration and deployment gates

**Phase:** 1 · **Priority:** P0 · **Accountable roles:** Platform + backend + release · **Effort:** M

**Depends on:** R04, R05.

**Why / intended outcome:** Current workflow can select development defaults and its health check does not prove readiness.

**Uses / connects to:** deploy-backend.yml; wrangler.jsonc; envcheck.ts; check-env.mjs; Vercel env.

**Acceptance / deliverable:** Explicit live environment/bindings; exact-commit tests and strict readiness gate deployment.

- [x] **R06.01 [CODE]** Resolve unqualified wrangler deploy in CI versus live settings under env.production before live deployment.
- [ ] **R06.02 [TODO]** Declare/verify production D1 bindings explicitly; inspect intended existing resources without overwriting them.
- [x] **R06.03 [CODE]** Align secret, migration, deploy and recovery commands to the same explicit environment/resource map.
- [x] **R06.04 [CODE]** Replace placeholder production Paystack webhook URL with the approved endpoint.
- [x] **R06.05 [CODE]** Replace hard-coded health host with controlled deploy output/configuration.
- [x] **R06.06 [CODE]** Assert config.ok=true and config.production=true, not only top-level ok=true.
- [x] **R06.07 [CODE]** Fail live readiness for mock payments, insecure cookies, weak secrets, HTTP origins and missing critical provider config.
- [x] **R06.08 [CODE]** Detect accidental dev-profile deployment independently of SESSION_SECURE, currently used to infer production.
- [ ] **R06.09 [TODO]** Validate SITE_URL, APP_URL, WEB_ORIGIN, Worker/media URLs and callbacks as one HTTPS configuration.
- [ ] **R06.10 [TODO]** Provision least-privilege secrets in platform stores and inspect names/status without exposing values.
- [ ] **R06.11 [TODO]** Protect live deployment with approvals and scoped credentials.
- [x] **R06.12 [CODE]** Make deploy depend on passed tests/build for the exact same commit; separate concurrent workflows are insufficient.
- [ ] **R06.13 [TODO]** Require pre-migration backup, migration review, smoke checks and abort/rollback procedure.
- [ ] **R06.14 [TODO]** Rehearse missing-secret, wrong-binding and dev-profile failures; verify none are reported healthy.

<a id="r07"></a>

### R07 — Authentication, recovery and sessions

**Phase:** 2 · **Priority:** P0 · **Accountable roles:** Backend + security + QA · **Effort:** M

**Depends on:** R05, R06.

**Why / intended outcome:** Reliable account access and recovery are prerequisites for paid services and shared-phone use.

**Uses / connects to:** auth.ts; crypto/session/totp; security UI; email.

**Acceptance / deliverable:** All persona access/recovery journeys and abuse cases pass in supported clients.

- [x] **R07.01 [CODE]** Retain password hashing/legacy upgrade, device sessions, TOTP and recovery-code implementations.
- [ ] **R07.02 [TODO]** Verify buyer/vendor/staff/admin register/login using real staging email.
- [ ] **R07.03 [TODO]** Test duplicate email, malformed inputs, password policy and enumeration-resistant responses.
- [ ] **R07.04 [TODO]** Verify reset/verification links expire, are single-use, use correct origins and stay out of logs/analytics.
- [ ] **R07.05 [TODO]** Test session fixation and cookie HttpOnly/Secure/SameSite/path properties.
- [ ] **R07.06 [TODO]** Test password changes/resets and suspension invalidate intended old sessions.
- [ ] **R07.07 [TODO]** Prove half-complete 2FA login cannot access protected routes.
- [ ] **R07.08 [TODO]** Enforce admin 2FA before live operations; rehearse approved lost-device recovery.
- [ ] **R07.09 [TODO]** Test TOTP drift/replay/concurrency and recovery-code single-use/exhaustion.
- [ ] **R07.10 [TODO]** Check brute-force controls against shared carrier IPs and legitimate recovery use.
- [ ] **R07.11 [TODO]** Remove routine production seed credentials after controlled bootstrap; check re-creation risks.
- [ ] **R07.12 [TODO]** Clear sensitive client state on logout and account switching on shared devices.
- [ ] **R07.13 [TODO]** Test session expiry mid-edit and on return from WhatsApp/Paystack.
- [x] **R07.14 [VERIFIED]** Preserve recovery-code letters and classify recovery/TOTP input without lossy digit stripping; test alphabetic, six-digit-containing and numeric recovery codes deterministically.
- [x] **R07.15 [VERIFIED]** Atomically consume recovery codes and TOTP replay state; verify concurrent challenges cannot reuse the same factor.
- [x] **R07.16 [VERIFIED]** Require the password and an unused enrolled factor before disabling 2FA; preserve factors when authentication fails.
- [x] **R07.17 [VERIFIED]** Generate enrolment QR codes locally and remove third-party QR requests containing the TOTP secret.


<a id="r08"></a>

### R08 — Authorization, tenancy and abuse prevention

**Phase:** 2 · **Priority:** P0 · **Accountable roles:** Security + backend · **Effort:** M

**Depends on:** R05, R07.

**Why / intended outcome:** Permissions must hold at API boundaries, across staff roles and business switching.

**Uses / connects to:** access.ts; proxy; app middleware; role routes; API keys; rate limits.

**Acceptance / deliverable:** Every route/method has an actor/tenant rule and automated denied-access coverage.

- [x] **R08.01 [CODE]** Retain owner/staff resolution and manager/sales/catalogue/support/accountant server-side permissions.
- [ ] **R08.02 [TODO]** Create route-by-method matrix for guest, buyer, each staff role, owner, admin and suspended/deleted users.
- [ ] **R08.03 [TODO]** Test allowed and denied direct API calls for every role, not only hidden navigation.
- [ ] **R08.04 [TODO]** Test cross-tenant enumerate/read/edit/delete/export/attach against every resource type.
- [ ] **R08.05 [TODO]** Test active-business changes and immediate access removal after seat revocation.
- [ ] **R08.06 [TODO]** Review public middleware exceptions for media, QR, sitemap, health and webhooks.
- [ ] **R08.07 [TODO]** Test spoofed internal/forwarding/Origin/Host headers through proxy and direct Worker boundary.
- [ ] **R08.08 [TODO]** Audit CSRF for every mutation including multipart upload and same-site subdomains.
- [ ] **R08.09 [TODO]** Review catalogue API-key scope, revoked keys, suspended tenants and result limits.
- [ ] **R08.10 [TODO]** Remove/deprecate query-string credentials; prevent key leakage through logs/referrers.
- [ ] **R08.11 [TODO]** Test HTML/URL/JSON-LD/custom-field/CSV injection; retain formula-safe exports.
- [ ] **R08.12 [TODO]** Bound enquiry spam, fake reviews, brigading, search abuse and upload exhaustion.
- [ ] **R08.13 [TODO]** Verify privileged audit coverage and absence of application routes that rewrite audit history.
- [ ] **R08.14 [TODO]** Commission focused external security review; fix critical/high-impact findings before paid public launch.
- [x] **R08.15 [VERIFIED]** Exclude live gateway config, environment variants and Android keystore/build artifacts from Git; verify ignore behavior.
- [x] **R08.16 [VERIFIED]** Audit all web/Worker dependencies, remove unused vulnerable test-pool tooling, patch runtime/transitive packages and verify typechecks, regression, build and zero reported advisories.

<a id="r09"></a>

### R09 — Privacy, legal, financial boundaries and channel policy

**Phase:** 2 · **Priority:** P0 · **Accountable roles:** Legal/privacy + product + finance · **Effort:** M

**Depends on:** R02, R03, R05.

**Why / intended outcome:** Public claims and app-store declarations must match actual data/money behavior.

**Uses / connects to:** Policies; export/closure endpoints; Nigeria obligations; provider agreements; store consoles.

**Acceptance / deliverable:** Approved disclosures, data-rights flows and channel-compliant purchase decisions.

- [x] **R09.01 [CODE]** Retain policy pages and export/closure code as foundations, not legal certification.
- [ ] **R09.02 [TODO]** Inventory personal data, purposes, processors, retention and international transfers.
- [ ] **R09.03 [TODO]** Obtain qualified review of applicable Nigerian privacy, consumer and business-disclosure requirements.
- [ ] **R09.04 [TODO]** Approve actual deposit payee/settlement obligations or leave collection disabled.
- [ ] **R09.05 [TODO]** Define refunds, cancellation, activation failure, bank-proof disputes and renewal disclosures.
- [ ] **R09.06 [TODO]** State verification is not delivery protection; link taps are not confirmed sales.
- [ ] **R09.07 [TODO]** Test export completeness across support, messages, staff and billing data as required.
- [ ] **R09.08 [TODO]** Test closure anonymization, session/token/API-key revocation, unpublishing and file deletion.
- [ ] **R09.09 [TODO]** Document lawful retention exceptions and backup expiry; do not promise unsupported instant erasure.
- [ ] **R09.10 [TODO]** Provide discoverable in-app deletion and channel-required external deletion-request URL.
- [ ] **R09.11 [TODO]** Review ads/analytics consent and actual loaded scripts/cookies/Android SDK data sharing.
- [ ] **R09.12 [TODO]** Review vendor-plan/add-on payments inside Android against each target store's current rules.
- [ ] **R09.13 [TODO]** Approve compliant Android purchase UX before implementation; web Paystack support is not store approval.
- [ ] **R09.14 [TODO]** Record policy URLs and review dates at submission; re-check historical Galaxy-guide assumptions.
- [ ] **R09.15 [TODO]** Assign privacy-request, breach, consumer-dispute and appeal contacts/deadlines.

<a id="r10"></a>

### R10 — Payments, activation, refunds and reconciliation

**Phase:** 2 · **Priority:** P0 · **Accountable roles:** Payments/backend + finance + QA · **Effort:** L

**Depends on:** R05–R07, R09.

**Why / intended outcome:** Mock success does not establish provider compatibility or settled money.

**Uses / connects to:** paystack/payments/reconcile libs; webhook; billing/admin; bank proof; provider sandbox/live.

**Acceptance / deliverable:** Approved sandbox/live flows reconcile without duplicate activation or false refunds.

- [x] **R10.01 [CODE]** Retain bank review, Paystack verification, plan activation and reconciliation foundations.
- [ ] **R10.02 [TODO]** Capture sanitized authoritative sandbox initialize/verify response fixtures.
- [x] **R10.03 [CODE]** Investigate parser expecting data.authorization.url against current provider schema; add failing fixture before changing code.
- [x] **R10.04 [CODE]** Handle timeouts, non-JSON/non-2xx, rate limits, outages and invalid keys safely.
- [ ] **R10.05 [TODO]** Match verified reference, amount in kobo, currency, local ownership and success status before activation.
- [x] **R10.06 [CODE]** Verify webhook-signature handling independently of server-to-server transaction verification.
- [ ] **R10.07 [TODO]** Test missing/invalid signature, unknown reference, wrong amount/account, pending/failed/reversed transaction.
- [ ] **R10.08 [TODO]** Test duplicate/out-of-order webhooks, concurrent approvals and callback-before/after-webhook races.
- [ ] **R10.09 [TODO]** Prove durable idempotency: one payment activates one intended subscription/add-on effect.
- [ ] **R10.10 [TODO]** Test cancel/back/refresh, poor connectivity and expired session with truthful payment status.
- [ ] **R10.11 [TODO]** Require bank/provider evidence for manual approval; uploaded screenshot remains an unverified claim.
- [ ] **R10.12 [TODO]** Test proof privacy, rejection, correction/resubmission and auditable reviewer identity.
- [ ] **R10.13 [TODO]** Test upgrades, renewal, grace/expiry, quota changes and referral-credit refund reversal.
- [ ] **R10.14 [TODO]** Seed reconciliation mismatches on purpose and verify alerts reach the responsible finance operator.
- [ ] **R10.15 [TODO]** Define refund authority and provider execution; local status changes must not be described as completed provider refunds.
- [ ] **R10.16 [TODO]** Check receipt reference, dates, business, amount, plan, refund state and approved tax treatment.
- [ ] **R10.17 [TODO]** Run owner-authorized low-value live charge/refund after sandbox sign-off; never charge during planning-only review.
- [ ] **R10.18 [TODO]** Accept deposits separately for payee, settlement, ledger, notice, reconciliation and refunds; otherwise leave disabled.
- [x] **R10.19 [VERIFIED]** Commit approval, subscription/add-on entitlement, audit and one in-app receipt in a single D1 transaction.
- [x] **R10.20 [VERIFIED]** Resume post-commit payment email/referral processing from a durable activation ledger without regranting access.
- [x] **R10.21 [VERIFIED]** Atomically reserve plan-only referral credit and replace eligible unpaid bank drafts without split balance writes.
- [x] **R10.22 [VERIFIED]** Return terminally failed/rejected/refunded holds once to the original captured credit owner.
- [x] **R10.23 [VERIFIED]** Record zero cash for fully credit-funded plans and roll back credit/access if their receipt cannot commit.
- [x] **R10.24 [VERIFIED]** Commit rejection/refund notice, audit, credit restoration and refunded add-on expiry with a durable settlement retry ledger.
- [x] **R10.25 [VERIFIED]** Reward the captured purchase price and commit referral balances with their in-app reward/reversal explanations.
- [x] **R10.26 [CODE]** Show gross price, applied/returned platform credit and cash separately on owned receipts.
- [x] **R10.27 [VERIFIED]** Upgrade synthetic historical D1 payments without reminting terminal credit or replaying old approvals.
- [x] **R10.28 [VERIFIED]** Refuse replacement of pending hosted plan checkouts and expire abandoned bank drafts only.
- [ ] **R10.29 [TODO]** Implement authoritative hosted-intent reconciliation and safe resume/cancel after initialization timeout or abandoned checkout.
- [ ] **R10.30 [TODO]** Reconcile historical credit balances, ownership changes, full-credit cash reporting and previously restored terminal rows before rollout.
- [ ] **R10.31 [TODO]** Approve and abuse-test referral rewards funded partly/fully by platform credit, multi-account loops and reversal after credit spending.
- [ ] **R10.32 [TODO]** Rehearse coordinated 0015–0017 rollout and compatible rollback/restore with existing pending payments.
- [x] **R10.33 [VERIFIED]** Preserve both purchased periods when overlapping first-time activation payments approve concurrently.
- [x] **R10.34 [VERIFIED]** Activate a fully credit-funded initial plan while an earlier bank proof is under review without losing its later purchased period.
- [x] **R10.35 [VERIFIED]** Keep moderation suspension in place when an existing payment is approved; reinstate only through the separate moderation decision.
- [x] **R10.36 [VERIFIED]** Persist validated hosted checkout capabilities privately and recover an owned payment by authoritative status verification before offering the same saved link.
- [x] **R10.37 [CODE]** Add billing check/resume controls, support guidance for missing/old capabilities and a correct zero-cash full-credit success message.
- [ ] **R10.38 [TODO]** Verify provider-terminal and checkout-reuse contracts with actual sandbox attempts including delayed success, abandonment and missing initialization responses.


<a id="r11"></a>

### R11 — Production media, private files and real PHP parity

**Phase:** 2 · **Priority:** P0 · **Accountable roles:** Backend + PHP/platform + security · **Effort:** L

**Depends on:** R04–R06, R08.

**Why / intended outcome:** Worker contract tests do not prove PHP runtime or private-file/audio behavior.

**Uses / connects to:** media.ts; mediafile routes; gateway PHP/config/.htaccess; GD; cPanel; tokens.

**Acceptance / deliverable:** Approved production driver handles required media securely with actual runtime tests.

- [x] **R11.01 [CODE]** Retain signed upload/finalize, D1 driver, gateway implementation and negative token tests.
- [ ] **R11.02 [TODO]** Document image/audio/private-proof/verification-document feature matrix per driver.
- [ ] **R11.03 [TODO]** Resolve image-only gateway MIME policy versus vendor voice notes; implement support or approved alternative.
- [ ] **R11.04 [TODO]** Verify private proofs/IDs cannot be retrieved through public/guessable URLs on the chosen driver.
- [ ] **R11.05 [TODO]** Provision HTTPS, gateway secret, permissions and non-public config in staging.
- [x] **R11.06 [CODE]** Deny config exposure, directory listing, executable files and scripts under media paths.
- [ ] **R11.07 [TODO]** Run actual PHP test-upload.sh flow; Python validation port is not PHP E2E evidence.
- [ ] **R11.08 [TODO]** Test MIME/magic-byte mismatch, corrupt/polyglot/SVG files and decompression bombs.
- [ ] **R11.09 [TODO]** Test expired/forged/replayed token, changed tenant/folder, traversal and foreign finalize.
- [ ] **R11.10 [TODO]** Validate size ceilings at browser, Next proxy, Worker, PHP and host layers.
- [ ] **R11.11 [TODO]** Test orientation, EXIF/location stripping, transparency, formats and GD missing/present.
- [ ] **R11.12 [TODO]** Verify storage quota after replace/delete/interruption/failed finalize and concurrent upload.
- [x] **R11.13 [CODE]** Add actual PHP runtime and private-file tests to CI/staging validation.
- [ ] **R11.14 [TODO]** Test orphan/delete cleanup cannot remove still-referenced live files.
- [ ] **R11.15 [TODO]** Plan D1→gateway migration with checksum, URL continuity, resumable copy and recovery.
- [ ] **R11.16 [TODO]** Verify public image/OG access without auth while all private documents remain protected.
- [x] **R11.17 [CODE]** Repair PHP configuration constants/variable mismatch and reject missing or placeholder gateway configuration.
- [x] **R11.18 [CODE]** Implement exact-origin CORS and OPTIONS handling for browser gateway uploads without credentialed wildcard access.
- [x] **R11.19 [CODE]** Sign the authorized folder in Worker upload tokens and enforce the same folder in the PHP gateway; coordinate expiring-token rollout.
- [x] **R11.20 [CODE]** Decode WebP byte strings with imagecreatefromstring instead of treating bytes as a filesystem filename.
- [x] **R11.21 [CODE]** Allow bounded longer scoped tokens at finalize and recheck business writability before accepting a previously issued upload.
- [x] **R11.22 [VERIFIED]** Require a domain-separated gateway HMAC receipt binding actual post-processing path, size, MIME, dimensions, checksum, business, token and expiry.
- [x] **R11.23 [VERIFIED]** Commit gateway media insertion and upload-token consumption in one guarded D1 batch; retry after insertion failure and serialize replay.
- [x] **R11.24 [CODE]** Atomically check current storage totals on gateway and D1 media insertion rather than relying solely on a prior quota read.
- [x] **R11.25 [CODE]** Reject undecodable or oversized image dimensions before GD allocation and reject normalization failure instead of publishing original EXIF-bearing bytes.
- [x] **R11.26 [CODE]** Create gateway files exclusively and handle partial writes without overwriting an existing path.
- [ ] **R11.27 [TODO]** Validate host/GD memory bounds, JPEG orientation and transparency/animation policies against real phone images and supported variants.


<a id="r12"></a>

### R12 — Low-data media and rendering performance

**Phase:** 3 · **Priority:** P1 · **Accountable roles:** Frontend + media/backend + performance QA · **Effort:** M

**Depends on:** R11.

**Why / intended outcome:** Prepaid-data and low-memory devices need small images and stable layout.

**Uses / connects to:** Media variants/metadata; cards; storefronts; CDN/cache; network profiler.

**Acceptance / deliverable:** Measured variants and page behavior meet approved low-data/device budgets.

- [ ] **R12.01 [TODO]** Baseline bytes, request count, LCP and memory on representative pages.
- [ ] **R12.02 [TODO]** Inspect present alt/dimension behavior instead of repeating obsolete audit claims.
- [ ] **R12.03 [TODO]** Choose thumbnail/card/detail sizes and quality from real render dimensions.
- [ ] **R12.04 [TODO]** Generate/persist safe variants with source width/height metadata.
- [ ] **R12.05 [TODO]** Use srcset/sizes or approved image component without arbitrary remote fetch abuse.
- [ ] **R12.06 [TODO]** Reserve aspect ratio, supply meaningful alt and prioritize only the actual LCP image.
- [ ] **R12.07 [TODO]** Lazy-load below-fold media and avoid preloading vendor audio.
- [ ] **R12.08 [TODO]** Backfill legacy media resumably without exceeding storage quotas.
- [ ] **R12.09 [TODO]** Use immutable asset caching without ever public-caching private artifacts.
- [ ] **R12.10 [TODO]** Show readable broken/slow-media fallbacks and actionable upload failures.
- [ ] **R12.11 [TODO]** Reduce expensive effects for reduced motion/data/low-end devices while retaining enquiry access.
- [ ] **R12.12 [TODO]** Publish before/after byte and timing results on 360px low-memory Android/mobile throttling.

<a id="r13"></a>

### R13 — Discovery, relevance and location search

**Phase:** 3 · **Priority:** P1 · **Accountable roles:** Product + frontend + backend/search · **Effort:** L

**Depends on:** R02, R05, R12.

**Why / intended outcome:** Buyers need useful local results and recovery from failed searches.

**Uses / connects to:** Public feeds/search/categories; search.ts; migration 0014; schemas.

**Acceptance / deliverable:** Representative queries and filters pass relevance, visibility and navigation acceptance.

- [x] **R13.01 [CODE]** Retain public discovery routes, dynamic categories, filters and current search foundations.
- [ ] **R13.02 [TODO]** Inspect FTS/synonym code and synchronization before selecting a replacement search system.
- [ ] **R13.03 [TODO]** Build real launch-category query set: local names, synonyms, typos, plurals, price and service area.
- [ ] **R13.04 [TODO]** Have buyers label useful results; baseline top-result quality and zero-result rate.
- [ ] **R13.05 [TODO]** Test all-term/exact/prefix behavior, punctuation, empty and pathological long input.
- [ ] **R13.06 [TODO]** Ensure every feed returns only eligible active/published content.
- [ ] **R13.07 [TODO]** Test typed custom-field filters and missing/invalid legacy values.
- [ ] **R13.08 [TODO]** Normalize city/service-area terms; explain service coverage without compulsory GPS.
- [ ] **R13.09 [TODO]** Preserve filters, sort, pagination and browser Back/Forward in shareable URLs.
- [ ] **R13.10 [TODO]** Offer zero-result recovery: fewer filters, nearby/category alternatives and optional saved search.
- [ ] **R13.11 [TODO]** Verify pagination stability, counts, featured disclosure and all empty/loading/error states.
- [ ] **R13.12 [TODO]** Benchmark target volumes and inspect query plans before adding indexes/services.
- [ ] **R13.13 [TODO]** Add typo tolerance only for measured failures with explicit cost/architecture decision.
- [ ] **R13.14 [TODO]** Verify removed/scam content stays hidden in alternate feeds/custom domains too.

<a id="r14"></a>

### R14 — Storefront trust and WhatsApp conversion

**Phase:** 3 · **Priority:** P0 · **Accountable roles:** Frontend + product + trust/safety + QA · **Effort:** M

**Depends on:** R08, R12, R13.

**Why / intended outcome:** The core outcome is a clear, intentional enquiry to a credible business.

**Uses / connects to:** Store/item SSR; wa.ts; inquiry API; cart; official contacts; OG; WhatsApp apps/web.

**Acceptance / deliverable:** Guest discovers, evaluates and enquires without forced account, false claims or broken handover.

- [x] **R14.01 [CODE]** Retain SSR stores/items, per-business cart, voice notes and wa.me generation.
- [ ] **R14.02 [TODO]** Test all item types show correct fields, price units, availability and CTA.
- [ ] **R14.03 [TODO]** Show official contacts, identity, location/coverage, hours and paused/unavailable states.
- [ ] **R14.04 [TODO]** Keep Verified ID, Featured and reviews distinct and truthful everywhere.
- [ ] **R14.05 [TODO]** Keep standard keyboard/tap enquiry action even when swipe animations exist.
- [ ] **R14.06 [TODO]** Normalize phone numbers; safely encode message text and reject invalid destinations.
- [ ] **R14.07 [TODO]** Include correct item/store URL and selected quantities with minimal personal data.
- [ ] **R14.08 [TODO]** Test standard/Business WhatsApp, both/neither installed, desktop Web and blocked popups.
- [ ] **R14.09 [TODO]** Do not equate generated link with completed message, sale or payment.
- [ ] **R14.10 [TODO]** Test cart grouping, quantity changes, stale prices, archived items and message-length limits.
- [ ] **R14.11 [TODO]** Label estimated totals/availability; never imply checkout guarantees.
- [ ] **R14.12 [TODO]** Test copied links, browser Back, old slugs and expired/removed listings.
- [ ] **R14.13 [TODO]** Keep safety/report controls visible near handover without a registration wall.
- [ ] **R14.14 [TODO]** Validate real WhatsApp previews across stores/items and slow/missing images.

<a id="r15"></a>

### R15 — Vendor onboarding and first useful catalogue

**Phase:** 3 · **Priority:** P1 · **Accountable roles:** Product + frontend + support/lifecycle · **Effort:** M

**Depends on:** R07, R10, R11, R14.

**Why / intended outcome:** Reduce time-to-first-value while keeping paid publication gates truthful.

**Uses / connects to:** sell/register/onboarding; dashboard; completeness; plans; activation/share.

**Acceptance / deliverable:** Phone-only vendor publishes a credible first listing and shares the right store link.

- [x] **R15.01 [CODE]** Retain plan choice, onboarding wizard, store-strength and share/QR foundations.
- [ ] **R15.02 [TODO]** Validate pricing/quota/add-on/period copy with real vendors.
- [ ] **R15.03 [TODO]** Allow draft preparation during payment review while preserving server-side publish restrictions.
- [ ] **R15.04 [TODO]** Resume safe onboarding progress after reload, timeout or upload interruption.
- [ ] **R15.05 [TODO]** Handle store-name/slug collisions, phone/category/location with inline guidance.
- [ ] **R15.06 [TODO]** Mark optional/required fields clearly and collect verification only when policy requires.
- [ ] **R15.07 [TODO]** Give category-specific examples without publishing fictional customer inventory.
- [ ] **R15.08 [TODO]** Test first photo/listing/WhatsApp-number/preview tasks on narrow Android.
- [ ] **R15.09 [TODO]** Make quota, validation, inactive-plan and moderation publish failures actionable.
- [ ] **R15.10 [TODO]** Send activation confirmation and accurate share kit: URL, QR and Status copy.
- [ ] **R15.11 [TODO]** Measure stalled step and time to first listing/lead with privacy-safe events.
- [ ] **R15.12 [TODO]** Provide assisted pilot onboarding; fix observed friction before adding steps.

<a id="r16"></a>

### R16 — Catalogue maintenance, schemas and bulk workflows

**Phase:** 3 · **Priority:** P1 · **Accountable roles:** Frontend + backend + vendor QA · **Effort:** L

**Depends on:** R05, R08, R11, R15.

**Why / intended outcome:** Vendors must maintain realistic catalogues without spreadsheet-like risk.

**Uses / connects to:** ItemForm; vendor catalogue; schemas; import/export; BulkBar; media.

**Acceptance / deliverable:** Owner and permitted staff can safely create/import/edit/publish/manage catalogue.

- [x] **R16.01 [CODE]** Retain CRUD, typed dynamic forms, CSV import/export and bulk/duplicate foundations.
- [ ] **R16.02 [TODO]** Create schema-field matrix for required, numeric, select, text and legacy invalid values.
- [ ] **R16.03 [TODO]** Keep server validation aligned with UI and category changes compatible with existing records.
- [ ] **R16.04 [TODO]** Test kobo precision, price types, free/on-request/negotiable copy and availability.
- [ ] **R16.05 [TODO]** Test draft/duplicate/image reorder/audio replacement/publish/archive/delete lifecycle.
- [ ] **R16.06 [TODO]** Enforce listing/category/storage limits through direct API and concurrent writes.
- [ ] **R16.07 [TODO]** Provide sample CSV with encoding, column mapping, types and limits.
- [ ] **R16.08 [TODO]** Preview row errors and safe partial results; retries must not duplicate imports.
- [ ] **R16.09 [TODO]** Test formula injection, huge/malformed rows, delimiters and unsafe media URLs.
- [ ] **R16.10 [TODO]** Preview destructive bulk actions, require confirmation and retain audit.
- [ ] **R16.11 [TODO]** Protect unsaved edits and clear retry behavior without claiming offline synchronization.
- [ ] **R16.12 [TODO]** Verify feed/search/media/analytics consistency after archive, edit and delete.
- [ ] **R16.13 [TODO]** Test staff restrictions and active-business switch while a form is open.
- [ ] **R16.14 [TODO]** Run 50-item phone-only maintenance exercise and measure effort/errors.

<a id="r17"></a>

### R17 — Lead pipeline, seller ROI and communication

**Phase:** 3 · **Priority:** P1 · **Accountable roles:** Product + frontend/backend + lifecycle · **Effort:** M

**Depends on:** R08, R10, R14, R16.

**Why / intended outcome:** Make enquiries manageable and seller value measurable without inventing WhatsApp visibility.

**Uses / connects to:** Leads/inbox/templates/analytics; CSV; digest; premium chat; gated deposits.

**Acceptance / deliverable:** Vendor triages leads and sees accurate tenant-specific metrics and reported outcomes.

- [x] **R17.01 [CODE]** Retain lead states, analytics, templates, CSV and seller-digest implementations.
- [ ] **R17.02 [TODO]** Verify enquiry deduplication, linkage, timestamps and bounded spam controls.
- [ ] **R17.03 [TODO]** Test notes/status/filters and permitted staff access.
- [ ] **R17.04 [TODO]** Label converted/sold as seller-reported, not verified transactions.
- [ ] **R17.05 [TODO]** Test gap-filled trends, date windows, comparison periods and timezone boundaries.
- [ ] **R17.06 [TODO]** Document view/tap denominators, bots and repeated-click assumptions.
- [ ] **R17.07 [TODO]** Verify tenant-specific formula-safe UTF-8 exports and totals.
- [ ] **R17.08 [TODO]** Prevent unsafe template links and cross-store data substitution.
- [ ] **R17.09 [TODO]** Test premium chat entitlement, guest token expiry and abuse controls separately from WhatsApp.
- [ ] **R17.10 [TODO]** Keep deposit UI aligned with approved actual money flow and explicit boundaries.
- [ ] **R17.11 [TODO]** Verify digest counts, preferences, delivery retry and quiet-store behavior.
- [ ] **R17.12 [TODO]** Do not add reply-speed badges without trustworthy response measurement.

<a id="r18"></a>

### R18 — Buyer accounts, saves and useful alerts

**Phase:** 3 · **Priority:** P1 · **Accountable roles:** Frontend + backend + product · **Effort:** M

**Depends on:** R07, R09, R13, R14.

**Why / intended outcome:** Optional accounts should add repeat-use value, not block first contact.

**Uses / connects to:** account; saved items/stores/search; growth; reviews; preferences.

**Acceptance / deliverable:** Account journeys work with visibility, consent and safe shared-device behavior.

- [x] **R18.01 [CODE]** Retain buyer saves, enquiry history, export/closure and preferences.
- [ ] **R18.02 [TODO]** Test guest saves/cart; decide safe deduplicated merge on login.
- [ ] **R18.03 [TODO]** Prompt registration at value moments rather than before browsing/enquiry.
- [ ] **R18.04 [TODO]** Test save/unsave across refresh, device, logout and account switch.
- [ ] **R18.05 [TODO]** Respect deleted, unpublished, blocked and suspended saved content.
- [ ] **R18.06 [TODO]** Verify price/stock alerts against actual prior values and deduplicate hourly runs.
- [ ] **R18.07 [TODO]** Check followed-store/search alerts show only eligible content and honor channel preferences.
- [ ] **R18.08 [TODO]** Show enquiry history without implying WhatsApp-message access.
- [ ] **R18.09 [TODO]** Test settings, opt-outs and email unsubscribe behavior.
- [ ] **R18.10 [TODO]** Test interaction-backed review eligibility, duplicate reviews and abuse limits.
- [ ] **R18.11 [TODO]** Test report/block/closure access on low-end phones with accessible confirmation.
- [ ] **R18.12 [TODO]** Measure repeat use before introducing personalization or cross-device recently viewed.

<a id="r19"></a>

### R19 — Teams, business switching, domains and API

**Phase:** 3 · **Priority:** P1 · **Accountable roles:** Backend + frontend + platform · **Effort:** M

**Depends on:** R06, R08, R16.

**Why / intended outcome:** Power-vendor integrations must preserve ownership and data boundaries.

**Uses / connects to:** access.ts; invites; active business; DNS/Vercel; catalogue API.

**Acceptance / deliverable:** Seats, tenant switching, custom domains and keys have tested secure lifecycles.

- [x] **R19.01 [CODE]** Retain staff roles, multi-business switching, domains and read-only API code.
- [ ] **R19.02 [TODO]** Test invite expiry/single-use/wrong-account, role change, revocation and seat quotas.
- [ ] **R19.03 [TODO]** Verify UI permissions match actual endpoint restrictions.
- [ ] **R19.04 [TODO]** Test owner-of-one/staff-of-another users; every screen/mutation/export uses active tenant.
- [ ] **R19.05 [TODO]** Clear stale private state/forms when switching businesses.
- [ ] **R19.06 [TODO]** Verify DNS ownership proof and least-privilege domain provisioning.
- [ ] **R19.07 [TODO]** Test duplicate/Unicode domains, failed DNS, TLS delay, removal and reuse.
- [ ] **R19.08 [TODO]** Verify canonical/OG/WhatsApp URLs and public-only routing on custom domains.
- [ ] **R19.09 [TODO]** Avoid broad session-cookie trust across vendor domains; document login limits.
- [ ] **R19.10 [TODO]** Display new API secret once, store hash, revoke effectively and log safely.
- [ ] **R19.11 [TODO]** Define versioning, pagination, limits and public-only API examples.
- [ ] **R19.12 [TODO]** Check paused/suspended businesses stay hidden through domains/API/old links.

<a id="r20"></a>

### R20 — Admin, trust/safety and support operations

**Phase:** 3 · **Priority:** P0 · **Accountable roles:** Trust/safety + support + backend/frontend · **Effort:** L

**Depends on:** R07–R10.

**Why / intended outcome:** Trust depends on staffed, explainable actions, not only admin screens.

**Uses / connects to:** Admin/report/SLA; verification; tickets; audit; reconciliation; policies.

**Acceptance / deliverable:** Operators resolve cases with access controls, SLA, notification and appeals.

- [x] **R20.01 [CODE]** Retain admin queues, report workflow/SLA, verification, support threads and health/audit code.
- [ ] **R20.02 [TODO]** Define prohibited-content, impersonation, job-scam, abuse and repeat-offender policies.
- [ ] **R20.03 [TODO]** Assign queue owners, operating hours, escalation and user-facing response targets.
- [ ] **R20.04 [TODO]** Test report creation, duplicates, assignment, evidence, investigation and every outcome.
- [ ] **R20.05 [TODO]** Verify removal/suspension on feeds, stores, domains, APIs, saves and relevant caches.
- [ ] **R20.06 [TODO]** Notify reporter/vendor without revealing confidential reporter details.
- [ ] **R20.07 [TODO]** Rehearse SLA warning/breach and external escalation when the app is down.
- [ ] **R20.08 [TODO]** Test private ID access, retention, badge expiry and renewal.
- [ ] **R20.09 [TODO]** Cross-flag high-risk deposit/job complaints for approved escalation without promising protection.
- [ ] **R20.10 [TODO]** Require reason/actor/audit for refund/revoke/extend/feature and separate provider confirmation.
- [ ] **R20.11 [TODO]** Test support creation/thread/status/ownership/attachment privacy and safe account/payment context.
- [ ] **R20.12 [TODO]** Define audited sign-in-as visibility and sensitive-operation restrictions.
- [ ] **R20.13 [TODO]** Rehearse appeals and mistaken-suspension recovery with retention controls.
- [ ] **R20.14 [TODO]** Train staff on scam, payment, recovery and privacy-request tabletop cases.
- [ ] **R20.15 [TODO]** Test phone admin queues and dangerous-action confirmation context.

<a id="r21"></a>

### R21 — Email and durable notification delivery

**Phase:** 3 · **Priority:** P0 · **Accountable roles:** Backend + lifecycle + platform · **Effort:** M

**Depends on:** R04, R07, R09, R17.

**Why / intended outcome:** Recovery and receipts cannot depend on no-op/best-effort mail.

**Uses / connects to:** mail/notify/notifyprefs; Resend or approved endpoint; DNS; outbox.

**Acceptance / deliverable:** Critical messages deliver/retry observably; optional alerts honor preferences.

- [x] **R21.01 [CODE]** Retain email adapters, in-app records and per-category preference code.
- [ ] **R21.02 [TODO]** Choose provider and verify domain/SPF/DKIM/DMARC under approved DNS control.
- [ ] **R21.03 [TODO]** Test real verification/reset/receipt/expiry/lead/support/security inbox delivery.
- [x] **R21.04 [CODE]** Implement durable outbox/queue or equivalent retry ledger for critical messages.
- [x] **R21.05 [CODE]** Add idempotency, bounded backoff, dead-letter alert and safe operator replay.
- [ ] **R21.06 [TODO]** Distinguish provider acceptance, delivery, bounce and complaint; verify event signatures if integrated.
- [ ] **R21.07 [TODO]** Redact reset links, private content and identifiers from logs/previews/analytics.
- [ ] **R21.08 [TODO]** Separate essential-service rules from optional marketing consent.
- [ ] **R21.09 [TODO]** Handle suppression/complaints while retaining important in-app records.
- [x] **R21.10 [CODE]** Render readable plain-text/HTML templates with correct references, amounts, origin and support.
- [x] **R21.11 [CODE]** Prevent optional messages to unsubscribed/closed users.
- [x] **R21.12 [CODE]** Rehearse provider outage and alert on backlog without losing notification intent.
- [x] **R21.13 [VERIFIED]** Require an independent MAIL_OUTBOX_KEY in hosted environments; encrypt bodies/recipients with intent-bound authenticated encryption.
- [x] **R21.14 [VERIFIED]** Escape mail titles, CTA labels/URLs and staff-controlled names before HTML rendering.
- [x] **R21.15 [VERIFIED]** Bound user-bound verification/reset queue expiry and recheck category preferences, account closure and recipient changes at dispatch.
- [x] **R21.16 [CODE]** Report durable queue acceptance separately from sent/delivered and return 503 on authenticated enqueue failure.
- [ ] **R21.17 [TODO]** Rehearse outbox-key custody and rotation with queued/dead mail and document drain or reviewed migration.
- [ ] **R21.18 [TODO]** Verify provider-side idempotency guarantees for the configured mail endpoint and duplicate acceptance after crash/timeout.


<a id="r22"></a>

### R22 — Coherent design, accessibility and responsive usability

**Phase:** 3 · **Priority:** P1 · **Accountable roles:** Design + frontend + accessibility QA · **Effort:** L

**Depends on:** R12–R20 as applicable.

**Why / intended outcome:** Polish must not hide inaccessible forms, gestures or blocked navigation.

**Uses / connects to:** Design tokens/components; layouts; WCAG 2.2 AA target; TalkBack; keyboard.

**Acceptance / deliverable:** No known core accessibility blocker; representative device tasks pass.

- [x] **R22.01 [CODE]** Retain responsive/focus/reduced-motion foundations and nesting/CSS checks.
- [ ] **R22.02 [TODO]** Inventory controls, dialogs, cards, menus, tables and empty/error/loading states.
- [ ] **R22.03 [TODO]** Standardize typography, spacing, feedback, destructive actions and navigation.
- [ ] **R22.04 [TODO]** Test 280/320/360/390/768/1024/1440px, ultrawide and landscape.
- [ ] **R22.05 [TODO]** Test 200% zoom, large text, long names/prices and content expansion.
- [ ] **R22.06 [TODO]** Measure contrast of text, placeholders, focus, badges and image overlays.
- [ ] **R22.07 [TODO]** Verify landmarks/headings/names/labels/alt/autocomplete semantics.
- [ ] **R22.08 [TODO]** Complete core discovery/auth/cart/catalogue/admin tasks with keyboard only.
- [ ] **R22.09 [TODO]** Test focus trap/return, skip links, route focus and announced async errors.
- [ ] **R22.10 [TODO]** Run TalkBack on real Android and Samsung browser.
- [ ] **R22.11 [TODO]** Keep swipe/drag/gyro/motion optional with tap/keyboard alternatives.
- [ ] **R22.12 [TODO]** Check target sizes, sticky overlap, safe areas, soft keyboard and password managers.
- [ ] **R22.13 [TODO]** Add automated accessibility scans; manually verify beyond scanner coverage.
- [ ] **R22.14 [TODO]** Run moderated buyer/vendor task sessions and fix highest-friction failures.
- [ ] **R22.15 [TODO]** Log exceptions with owner/deadline; never waive blocked core access for launch.
- [x] **R22.16 [VERIFIED]** Hide the React-owned intro instead of deleting its DOM node during route transitions.
- [x] **R22.17 [CODE]** Keep magnetic effects from moving clickable targets while a pointer or automation attempts activation.


<a id="r23"></a>

### R23 — SEO, sharing, PWA and truthful offline behavior

**Phase:** 3 · **Priority:** P1 · **Accountable roles:** Frontend + SEO/growth + platform · **Effort:** M

**Depends on:** R06, R12–R14.

**Why / intended outcome:** Search/sharing are acquisition paths; offline fallback is not an offline catalogue.

**Uses / connects to:** Metadata/OG; sitemap; robots; manifest; sw.js; custom domains.

**Acceptance / deliverable:** Crawlable/shareable/installable public routes with resilient inventory and honest offline limits.

- [x] **R23.01 [CODE]** Retain SSR metadata/OG, sitemap, manifest and navigation-failure offline fallback.
- [ ] **R23.02 [TODO]** Verify titles/descriptions/canonical/og:url across public/custom-domain routes.
- [ ] **R23.03 [TODO]** Validate structured data matches displayed business/item/price/review facts.
- [ ] **R23.04 [TODO]** Check robots/noindex for private/auth/dashboard/staging and duplicate filter pages.
- [ ] **R23.05 [TODO]** Test sitemap visibility, complete inventory and volume limits.
- [x] **R23.06 [CODE]** Replace volatile in-memory last-good sitemap strategy with durable monitored fallback/age policy.
- [ ] **R23.07 [TODO]** Distinguish dynamic-render build warnings from genuine upstream sitemap failures.
- [ ] **R23.08 [TODO]** Test cold start plus Worker outage; never silently shrink inventory to home unnoticed.
- [ ] **R23.09 [TODO]** Test actual WhatsApp rich cards, media headers and fetch latency.
- [ ] **R23.10 [TODO]** Validate icons/maskable safe area, manifest scope/ID/start URL and standalone navigation.
- [ ] **R23.11 [TODO]** Describe service worker as network-first navigation with offline fallback, not offline editing/search.
- [ ] **R23.12 [TODO]** Test offline/reconnect/update and obsolete cache cleanup.
- [ ] **R23.13 [TODO]** Never cache private pages/proofs/tokens without separately approved design.
- [ ] **R23.14 [TODO]** Preserve supported old shared URLs with safe redirects on slug changes.
- [x] **R23.15 [CODE]** Serve bounded XML sitemap index/shards through Next proxy routes with visibility filtering and durable stale snapshots.


<a id="r24"></a>

### R24 — Product analytics, growth and unit economics

**Phase:** 3 · **Priority:** P1 · **Accountable roles:** Product analytics + growth + finance · **Effort:** M

**Depends on:** R02, R09, R15, R17, R18.

**Why / intended outcome:** Measure value and sustainable operations without private-message attribution.

**Uses / connects to:** Existing analytics/events; consent; finance; referrals.

**Acceptance / deliverable:** Auditable funnels and cohort economics with privacy-safe events.

- [x] **R24.01 [CODE]** Retain vendor analytics, referral and platform-growth foundations; inspect current coverage first.
- [ ] **R24.02 [TODO]** Define event schema with actor/tenant/source/time/event ID and allowed properties.
- [ ] **R24.03 [TODO]** Exclude phone/email/message/private URL/token/proof/ID data from events.
- [ ] **R24.04 [TODO]** Instrument discover/search/enquiry intent/link result/signup/listing/payment/renewal transitions.
- [ ] **R24.05 [TODO]** Specify consent, deduplication, bot filtering and sampling.
- [ ] **R24.06 [TODO]** Build buyer/vendor funnels by cohort/source with anonymous-session limitations stated.
- [ ] **R24.07 [TODO]** Separate handover, seller-reported sale and provider-confirmed vendor payment.
- [ ] **R24.08 [TODO]** Calculate acquisition/activation cost, gross margin, provider fees, support and media costs.
- [ ] **R24.09 [TODO]** Measure free→paid, renewal, churn reasons and active catalogue/lead cohorts.
- [ ] **R24.10 [TODO]** Test referral caps, eligibility, first-paid-only credit, self-referral and refunds.
- [ ] **R24.11 [TODO]** Run pricing/value experiments with disclosed terms and predefined rollback.
- [ ] **R24.12 [TODO]** Assess ads for privacy, data cost, inappropriate creatives and enquiry distraction.
- [ ] **R24.13 [TODO]** Prioritize language/retention experiments only with research and event evidence.

<a id="r25"></a>

### R25 — Automated quality and critical-journey regression

**Phase:** 4 · **Priority:** P0 · **Accountable roles:** QA automation + engineering · **Effort:** L

**Depends on:** R04–R24 applicable release scope.

**Why / intended outcome:** Backend tests/builds do not exercise browser forms, device APIs or real PHP.

**Uses / connects to:** Vitest; Playwright; CI; PHP runner; sanitized fixtures.

**Acceptance / deliverable:** Repeatable, isolated multi-layer tests gate exact release commits.

- [x] **R25.01 [CODE]** Retain Worker suite and web type/build/nesting/CSS CI foundations.
- [x] **R25.02 [VERIFIED]** Stabilize full fresh-checkout backend suite; record exact counts/duration, not stale README totals.
- [x] **R25.03 [VERIFIED]** Fix waitForPortFree async isPortOpen missing await and add regression coverage.
- [x] **R25.04 [VERIFIED]** Isolate test ports/state or enforce ownership; never kill unrelated developer processes.
- [x] **R25.05 [CODE]** Configure Playwright with deterministic seed, web+Worker lifecycle and separate test environment.
- [ ] **R25.06 [TODO]** Automate guest discover/filter/item/WhatsApp-link journey at observable boundaries.
- [ ] **R25.07 [TODO]** Automate vendor signup/draft/free activation/upload/publish/share/lead triage.
- [ ] **R25.08 [TODO]** Automate bank review and sandbox Paystack status/webhook paths with provider fixtures.
- [ ] **R25.09 [TODO]** Automate buyer saves/preferences/export/closure and staff invite/switch/revoke.
- [ ] **R25.10 [TODO]** Add accessibility, critical visual and responsive-overflow checks.
- [ ] **R25.11 [TODO]** Run actual PHP/private-file tests, not only a validator reimplementation.
- [ ] **R25.12 [TODO]** Test cron transitions with controlled time and idempotent repeat runs.
- [ ] **R25.13 [TODO]** Cover timeout/malformed provider/duplicate event/poor network/session expiry failures.
- [ ] **R25.14 [TODO]** Retain sanitized traces/screenshots/logs with restricted access and expiry.
- [ ] **R25.15 [TODO]** Require checks on PR/release; quarantine only noncritical flakes with owner/expiry.
- [ ] **R25.16 [TODO]** Add selected-route Android smoke/regression pack and reuse shared journey assertions.
- [x] **R25.17 [VERIFIED]** Execute real PHP HTTP regression tests for upload/serve, CORS, signature/expiry, tenant/folder, traversal, MIME, size and overwrite; retain hosting acceptance separately.
- [x] **R25.18 [VERIFIED]** Run real-browser signup/free activation, local QR/recovery sign-in, password reset and protected-route/viewport smoke journeys without retries.
- [x] **R25.19 [VERIFIED]** Support isolated pre-migration historical fixtures and exercise the real local D1 upgrade path.
- [x] **R25.20 [VERIFIED]** Exercise actual PHP upload, normalization, signed receipt and Worker finalization against isolated D1 with no production data.


<a id="r26"></a>

### R26 — Performance, capacity and cost acceptance

**Phase:** 4 · **Priority:** P1 · **Accountable roles:** Performance/backend + platform + QA · **Effort:** M

**Depends on:** R05, R12, R13, R25.

**Why / intended outcome:** Prove launch capacity and low-end usability rather than infer them from builds.

**Uses / connects to:** Profilers; lab/RUM; load tests; D1 plans; host/provider quotas.

**Acceptance / deliverable:** Agreed traffic/device targets and cost limits pass with evidence.

- [ ] **R26.01 [TODO]** Define pilot and 10× workload: vendors/listings/media/sessions/searches/uploads/concurrency.
- [ ] **R26.02 [TODO]** Propose p75 LCP≤2.5s, INP≤200ms, CLS≤0.1 for supported cohorts; distinguish lab proxies.
- [ ] **R26.03 [TODO]** Set API/error/upload/memory budgets from measured baseline and business targets.
- [ ] **R26.04 [TODO]** Retain 32KB gzip CSS budget and measure headroom before adding styles.
- [ ] **R26.05 [TODO]** Measure JS/images/fonts/total bytes for home/search/item/dashboard on mobile throttling.
- [ ] **R26.06 [TODO]** Load-test staging search/feed/mutations with synthetic identities and safe rate limits.
- [ ] **R26.07 [TODO]** Measure Worker CPU, D1 reads/writes/latency and cPanel disk/inodes/bandwidth.
- [ ] **R26.08 [TODO]** Stress upload bursts, queues, digests and reconciliation with target data volume.
- [ ] **R26.09 [TODO]** Optimize measured bottlenecks with pagination/indexes/cache/payloads and remeasure.
- [ ] **R26.10 [TODO]** Define graceful saturation, provider timeouts/backpressure and recovery.
- [ ] **R26.11 [TODO]** Model monthly provider/hosting/email/media/domain/store costs with alert thresholds.
- [ ] **R26.12 [TODO]** Define funded scale triggers; avoid new infrastructure without measured need.

<a id="r27"></a>

### R27 — Monitoring, incident response and complete recovery

**Phase:** 4 · **Priority:** P0 · **Accountable roles:** Platform/SRE + security + support · **Effort:** L

**Depends on:** R06, R10, R11, R21, R25.

**Why / intended outcome:** App-local health and untested backups are not operational resilience.

**Uses / connects to:** errorlog; cron; logs; external monitors; D1/media backups; runbooks.

**Acceptance / deliverable:** External alerts, owned incidents and full isolated restore/rollback meet approved targets.

- [x] **R27.01 [CODE]** Retain error logs, health UI, hourly jobs and D1 export/prune script.
- [x] **R27.02 [CODE]** Separate liveness/readiness including safe D1/config checks without secret leakage.
- [ ] **R27.03 [TODO]** Monitor web, strict Worker readiness, media and recovery-email path externally.
- [ ] **R27.04 [TODO]** Alert outside app for 5xx/payment drift/mail backlog/cron silence/media failures.
- [ ] **R27.05 [TODO]** Add correlation IDs proxy→Worker→provider with token/PII redaction.
- [ ] **R27.06 [TODO]** Define on-call owner, severity, acknowledgement and fallback communication.
- [ ] **R27.07 [TODO]** Reconcile actual subscription expiry/grace timestamps with approved behavior/copy.
- [x] **R27.08 [CODE]** Record cron start/end/duration/result/count and prevent overlapping duplicate effects.
- [ ] **R27.09 [TODO]** Batch/checkpoint long sweeps and isolate failures so one job cannot suppress all others silently.
- [ ] **R27.10 [TODO]** Automate encrypted off-host D1 backup, checksum, completion alert and retention.
- [ ] **R27.11 [TODO]** Back up gateway public/private media and configuration separately from D1.
- [ ] **R27.12 [TODO]** Propose RPO≤24h/RTO≤4h; obtain approval/funding or revise explicitly.
- [ ] **R27.13 [TODO]** Restore D1+media into isolated resources and verify login/counts/files/store/payment history.
- [ ] **R27.14 [TODO]** Rehearse web/Worker rollback; handle schema/data recovery as a separate plan.
- [ ] **R27.15 [TODO]** Write payment outage, admin compromise, secret leak, lost media and mass-scam playbooks.
- [ ] **R27.16 [TODO]** Run incident drill, record actual recovery time and schedule recurring restore tests.
- [x] **R27.17 [CODE]** Register the Cloudflare scheduled entrypoint, await maintenance, log timing/completion and propagate sanitized failures for platform monitoring.
- [x] **R27.18 [VERIFIED]** Fence concurrent hourly work with expiring owned leases and retain sanitized durable completion/failure history.
- [x] **R27.19 [VERIFIED]** Rotate failed payment follow-ups fairly and expose bounded admin-only backlog with ten-minute aging and hourly alert cooldown.


<a id="r28"></a>

### R28 — Web pilot and public release

**Phase:** 5 · **Priority:** P0 · **Accountable roles:** Release + product + QA + operations · **Effort:** L

**Depends on:** R06–R27 release-required tasks.

**Why / intended outcome:** Launch only with observed user and operational acceptance.

**Uses / connects to:** Staging acceptance; live hosts/providers; pilot cohort; metrics; support rota.

**Acceptance / deliverable:** Measured controlled pilot then monitored general availability with rollback.

- [ ] **R28.01 [TODO]** Freeze enabled MVP inventory; server-disable incomplete/risky features, not just nav links.
- [ ] **R28.02 [TODO]** Close P0 and blocking P1 defects; approve bounded nonblocking waivers explicitly.
- [ ] **R28.03 [TODO]** Obtain security/privacy/accessibility/finance acceptance for enabled features.
- [ ] **R28.04 [TODO]** Verify live DNS/TLS/origins/cookies/redirects and staging isolation.
- [ ] **R28.05 [TODO]** Re-run exact-commit CI, migration rehearsal, recovery and smoke pack.
- [ ] **R28.06 [TODO]** Deploy via corrected protected workflow; record commit/migrations/env/rollback reference.
- [ ] **R28.07 [TODO]** Smoke guest enquiry, vendor publish, private-file denial, real recovery mail and authorized payment/refund.
- [ ] **R28.08 [TODO]** Recruit small city/category vendor cohort and verify listing/contact accuracy with consent.
- [ ] **R28.09 [TODO]** Support pilot buyers/vendors and measure activation/enquiries/safety/task completion.
- [ ] **R28.10 [TODO]** Review pilot daily; fix conversion/safety failures before paid acquisition.
- [ ] **R28.11 [TODO]** Publish accurate help/contact/pricing/safety/policies and remove demo claims.
- [ ] **R28.12 [TODO]** Make go/no-go decision against signed targets; defer if money/security/data-loss risk remains.
- [ ] **R28.13 [TODO]** Expand traffic gradually while watching errors/support/provider health/cost.
- [ ] **R28.14 [TODO]** Run day-1/day-7/day-30 reviews with assigned corrective actions.

<a id="r29"></a>

### R29 — Android project and trusted-origin foundation

**Phase:** 6A · **Priority:** P0 for Android · **Accountable roles:** Android + platform/web + security · **Effort:** L

**Depends on:** R03 route, R06, R09, R23; parallel to web hardening.

**Why / intended outcome:** TWA is now selected and internal source exists; prove the actual build, signing/association and devices before store art.

**Uses / connects to:** Proposed TWA/Bubblewrap or chosen alternative; JDK/SDK; assetlinks; HTTPS; signing.

**Acceptance / deliverable:** One reproducible internal app securely launches approved origin on real devices.

- [ ] **R29.01 [TODO]** Approve architecture from R03 with current policy eligibility and required device features.
- [x] **R29.02 [VERIFIED]** Create android/ only after route decision; amend route-specific steps if not TWA.
- [ ] **R29.03 [TODO]** Choose permanent package/application ID, label, version scheme and current min/target SDK.
- [x] **R29.04 [CODE]** Pin build tools/generator/JDK/SDK and document reproducible clean build.
- [x] **R29.05 [CODE]** Set staging/live HTTPS launch URL, origin/scope/network policy; prohibit cleartext live traffic.
- [x] **R29.06 [CODE]** Separate debug/internal signing from release signing; no keystores/passwords in Git.
- [ ] **R29.07 [TODO]** Assign release-key custody, encrypted backup, recovery and Play signing strategy if applicable.
- [ ] **R29.08 [TODO]** For TWA publish /.well-known/assetlinks.json with package and correct signing fingerprints.
- [ ] **R29.09 [TODO]** Distinguish debug/upload/store app-signing certificates and test distributed certificate association.
- [ ] **R29.10 [TODO]** Verify on-device association without redirect/TLS/content-type errors.
- [ ] **R29.11 [TODO]** Configure adaptive/maskable icons, splash/status/navigation bars and accessible label.
- [ ] **R29.12 [TODO]** Install internal artifact on low-end Android and Samsung; record OS/browser provider behavior.
- [ ] **R29.13 [TODO]** Have second engineer reproduce build and review license/source instructions.
- [ ] **R29.14 [TODO]** For Capacitor/native implement safe navigation/bridge/scoped auth storage first; never bundle INTERNAL_SECRET.
- [x] **R29.15 [CODE]** Add a minimal TWA launcher with exact HTTPS-origin filtering, stripped incoming intent extras and custom-tab fallback instead of a privileged WebView.
- [x] **R29.16 [VERIFIED]** Serve runtime-configured Digital Asset Links JSON; fail 503 without valid identities and refuse debug certificates on the production domain.
- [x] **R29.17 [VERIFIED]** Add pinned Android debug build/unit/lint CI with checksum-verified Gradle distribution and short-lived internal artifacts.
- [x] **R29.18 [VERIFIED]** Fail release tasks without explicit approval and protected signing variables; keep debug application identity separate.
- [ ] **R29.19 [TODO]** Confirm the existing Galaxy package/application ID, installed signing certificate and update lineage before adopting the proposed release identity.


<a id="r30"></a>

### R30 — Android links, Back and external handovers

**Phase:** 6A · **Priority:** P0 for Android · **Accountable roles:** Android + frontend + QA · **Effort:** L

**Depends on:** R14, R29.

**Why / intended outcome:** App links/external apps must not trap users or leak data.

**Uses / connects to:** App links/intents; TWA/browser fallback; public URLs; wa.me; Paystack return.

**Acceptance / deliverable:** Cold/warm/deep-link/Back/WhatsApp/payment journeys pass on real devices.

- [ ] **R30.01 [TODO]** Specify navigation for buyer, cart, auth, account and approved vendor screens.
- [ ] **R30.02 [TODO]** Verify app links for public store/item routes while preserving useful app-absent web links.
- [ ] **R30.03 [TODO]** Test cold/warm/already-open/process-killed launch from WhatsApp/SMS/browser.
- [ ] **R30.04 [TODO]** Test Back through item/search/cart/history and external return without loops/unexpected exit.
- [ ] **R30.05 [TODO]** Open external origins in approved browser/custom-tab context, not unrestricted privileged surface.
- [ ] **R30.06 [TODO]** Test WhatsApp standard-only/Business-only/both/neither/disabled/outdated configurations.
- [ ] **R30.07 [TODO]** Verify destination/text/long multi-item messages and preview after handover.
- [ ] **R30.08 [TODO]** Restore proper listing/cart/session after WhatsApp without duplicate lead submissions.
- [ ] **R30.09 [TODO]** Test hosted Paystack return for cancel/fail/success/delayed verification.
- [ ] **R30.10 [TODO]** Handle reset/verify/invite links on correct origin without token logs.
- [ ] **R30.11 [TODO]** Test share sheet/copy/QR links from a second phone; retain public web URLs.
- [ ] **R30.12 [TODO]** Reject unsafe malformed intents/untrusted origins/schemes and exported-component abuse.
- [ ] **R30.13 [TODO]** Test missing trusted browser and failed association fallback without blank screens.

<a id="r31"></a>

### R31 — Android permissions, media, lifecycle and offline recovery

**Phase:** 6A · **Priority:** P0 for Android · **Accountable roles:** Android + web/media + QA · **Effort:** L

**Depends on:** R07, R11, R23, R29, R30.

**Why / intended outcome:** Mobile interruptions/permissions can break otherwise-working browser workflows.

**Uses / connects to:** Photo picker/camera/mic; MediaRecorder; cookies; lifecycle; offline page.

**Acceptance / deliverable:** Minimum permissions and recoverable core workflows without false offline claims.

- [ ] **R31.01 [TODO]** Map feature→permission; ask only after user starts the relevant action.
- [ ] **R31.02 [TODO]** Prefer system picker; avoid broad storage/contacts/SMS/location without approved necessity.
- [ ] **R31.03 [TODO]** Test gallery/camera/cloud-provider upload and denied permissions.
- [ ] **R31.04 [TODO]** Test large photos/orientation/interruption/retry/validation feedback.
- [ ] **R31.05 [TODO]** Test record/stop/play/upload codecs on production media driver; degrade unsupported mic safely.
- [ ] **R31.06 [TODO]** Test incoming call, lock, background and process death during recording; stop capture and explain loss.
- [ ] **R31.07 [TODO]** Test persistent login/logout/reset/session expiry and 2FA if exposed in app.
- [ ] **R31.08 [TODO]** Measure actual TWA/browser cookie sharing; do not assume isolated sessions.
- [ ] **R31.09 [TODO]** Test shared-phone account switches for residual private state.
- [ ] **R31.10 [TODO]** Test airplane-mode cold start/navigation/reconnect/slow timeout; never silently queue money actions.
- [ ] **R31.11 [TODO]** Test rotation/font size/cutouts/gesture bars/foldables or tablets where supported/keyboard overlap.
- [ ] **R31.12 [TODO]** Profile battery/data and avoid needless background work/autoplay/prefetch/haptics.
- [ ] **R31.13 [TODO]** If native tokens are needed, design scoped secure storage/rotation; no proxy master secrets.
- [ ] **R31.14 [TODO]** Keep push optional and separately scoped; email/in-app remain baseline until push is implemented.

<a id="r32"></a>

### R32 — Android CI, signing, security and device regression

**Phase:** 6B · **Priority:** P0 for Android · **Accountable roles:** Android + QA + platform/security · **Effort:** L

**Depends on:** R25, R29–R31.

**Why / intended outcome:** A debug app is not a signed, maintainable and traceable release.

**Uses / connects to:** Android CI; protected keys; artifact/SBOM scans; test tracks; real devices.

**Acceptance / deliverable:** Signed exact-source candidates pass device/security/accessibility regression.

- [x] **R32.01 [CODE]** Add clean Android build, lint and route-appropriate unit/instrumentation CI.
- [ ] **R32.02 [TODO]** Protect signing jobs/secrets from untrusted PRs with least privilege.
- [ ] **R32.03 [TODO]** Build signed Play AAB and other channel-required artifact; verify checksum/signature.
- [ ] **R32.04 [TODO]** Increment versionCode/versionName and record commit/web compatibility/release notes.
- [ ] **R32.05 [TODO]** Scan dependencies/manifest/exported components/debug flags/cleartext/secrets.
- [ ] **R32.06 [TODO]** Compare every permission and SDK with privacy/data-safety declarations.
- [ ] **R32.07 [TODO]** Test agreed low/mid/high Android OS/hardware and Samsung/Chrome providers.
- [ ] **R32.08 [TODO]** Run TalkBack, large text, motion and system theme changes on packaged app.
- [ ] **R32.09 [TODO]** Measure startup/upload/recording/scrolling and sustained memory/battery/data usage.
- [ ] **R32.10 [TODO]** Test auth/roles/tenancy/deletion through real artifact rather than only browser emulation.
- [ ] **R32.11 [TODO]** Test install/update/uninstall/reinstall and missing-provider/offline behavior.
- [ ] **R32.12 [TODO]** Complete internal/closed testing required by actual developer account/channel.
- [ ] **R32.13 [TODO]** Set proposed crash-free target≥99.5% and no reproducible core ANR; use route-appropriate privacy-safe observability.
- [ ] **R32.14 [TODO]** Archive artifacts/symbols if relevant/checksums/evidence in restricted storage, not Git.

<a id="r33"></a>

### R33 — Play/Galaxy metadata, declarations and review

**Phase:** 6B · **Priority:** P0 for Android · **Accountable roles:** Release + compliance + design + support · **Effort:** M

**Depends on:** R09, R29, R32.

**Why / intended outcome:** Historical Galaxy guidance is not a binary, current policy or approval.

**Uses / connects to:** Store-listing drafts; capture/check scripts; Play/Galaxy consoles; legal URLs.

**Acceptance / deliverable:** Truthful exact-release submission with reviewer access and current-policy checks.

- [x] **R33.01 [CODE]** Retain Galaxy copy/storyboard/capture/validation scripts as drafts only.
- [ ] **R33.02 [TODO]** Choose Google Play/Galaxy/direct channels explicitly and budget their support/compliance.
- [ ] **R33.03 [TODO]** Verify owner-controlled developer accounts/business identity/support contact.
- [ ] **R33.04 [TODO]** Check current SDK/test/artifact/image/rating/deletion requirements in each console.
- [ ] **R33.05 [TODO]** Confirm selected TWA/wrapper/native eligibility and sufficient channel-quality value.
- [ ] **R33.06 [TODO]** Resolve plan/add-on/deposit payment-policy approval before enabling submitted purchase paths.
- [ ] **R33.07 [TODO]** Write accurate function-focused title/descriptions and WhatsApp/off-platform safety boundaries.
- [ ] **R33.08 [TODO]** Choose category/rating/languages/territories from real content and moderation policy.
- [ ] **R33.09 [TODO]** Verify public privacy/terms/support/deletion URLs load without login.
- [ ] **R33.10 [TODO]** Complete declarations from actual web+Android cookies/scripts/SDK behavior, not manifest alone.
- [ ] **R33.11 [TODO]** Capture sharp exact-app screenshots with approved demo data and no private notifications.
- [ ] **R33.12 [TODO]** Validate current per-channel dimensions/icon rules; historical screenshot dimensions are not universal policy.
- [ ] **R33.13 [TODO]** Provide stable reviewer credentials/instructions without publicly exposing admin access.
- [ ] **R33.14 [TODO]** Prepare signing/version record/release notes/countries/rollout fraction and response owner.
- [ ] **R33.15 [TODO]** Submit to appropriate channel/test track and record actual decision/fixes, never infer acceptance.

<a id="r34"></a>

### R34 — Android staged rollout and update operations

**Phase:** 7 · **Priority:** P0 for Android · **Accountable roles:** Release + Android + platform + support · **Effort:** M

**Depends on:** R28, R32, R33 approval.

**Why / intended outcome:** Installed apps and shared web releases require compatibility and safe promotion.

**Uses / connects to:** Store tracks; web releases; association; monitoring; support; key custody.

**Acceptance / deliverable:** Approved staged app release with clear fallback, maintenance and stop conditions.

- [ ] **R34.01 [TODO]** Wait for actual channel approval before marking publication complete.
- [ ] **R34.02 [TODO]** Release to limited cohort and monitor startup/auth/navigation/upload/WhatsApp/payment.
- [ ] **R34.03 [TODO]** Own native crash/ANR where observable plus web errors and association failures.
- [ ] **R34.04 [TODO]** Stop promotion on safety/money/access/data-loss regressions.
- [ ] **R34.05 [TODO]** Test material web releases against installed web-backed shell/browser providers.
- [ ] **R34.06 [TODO]** Define native/Capacitor API compatibility window if selected and safe upgrade behavior.
- [ ] **R34.07 [TODO]** Retain prior artifacts; distinguish halted rollout from rollback requiring higher version replacement.
- [ ] **R34.08 [TODO]** Keep usable web fallback during store delays/unsupported devices.
- [ ] **R34.09 [TODO]** Review store support/ratings and request feedback without coercion.
- [ ] **R34.10 [TODO]** Schedule SDK/dependency/security/target-level/association maintenance with owners.
- [ ] **R34.11 [TODO]** Rehearse lost-key/account access recovery and document limits.
- [ ] **R34.12 [TODO]** Review day-1/day-7/day-30 outcomes before broad availability.

<a id="r35"></a>

### R35 — Evidence-led postlaunch improvement and expansion

**Phase:** 8 · **Priority:** P2 · **Accountable roles:** Product + engineering + growth + operations · **Effort:** L / continuous

**Depends on:** R28; R34 for Android-specific work.

**Why / intended outcome:** Potential comes from user outcomes and sustainable safety, not feature count.

**Uses / connects to:** Cohort analytics; interviews; support/moderation; costs; ADRs; experiments.

**Acceptance / deliverable:** Quarterly roadmap follows evidence, funding and quality/safety gates.

- [ ] **R35.01 [TODO]** Review activation/leads/renewal/fraud/performance/cost by location/category/platform monthly.
- [ ] **R35.02 [TODO]** Interview retained/churned vendors and successful/unsuccessful buyers.
- [ ] **R35.03 [TODO]** Fix measured relevance/zero-result failures before adding personalization/search services.
- [ ] **R35.04 [TODO]** Test Pidgin/key-language comprehension and safety before broader localization architecture.
- [ ] **R35.05 [TODO]** Improve consented saved/followed alerts without notification fatigue.
- [ ] **R35.06 [TODO]** Expand bulk tools/integrations only for demonstrated active vendor needs.
- [ ] **R35.07 [TODO]** Scope push/offline drafts/native workflows separately with conflict/security/cost designs.
- [ ] **R35.08 [TODO]** Reassess money/deposit features only with compliant operations and unit economics.
- [ ] **R35.09 [TODO]** Expand cities/categories after supply quality, local relevance and moderation coverage hold.
- [ ] **R35.10 [TODO]** Re-test accessibility/low-data/core conversion after major redesigns.
- [ ] **R35.11 [TODO]** Run quarterly access/secrets/retention/restore/provider-cost reviews.
- [ ] **R35.12 [TODO]** Retire unused features safely with notice/export/migration.
- [ ] **R35.13 [TODO]** Publish quarterly outcomes and next priorities; preserve task IDs and unfinished history.

## Delivery artifacts and their homes

| Artifact | Suggested location | Acceptance |
|---|---|---|
| Scope, journey map, metric definitions and pilot targets | Proposed `docs/product/` or approved research workspace | Product acceptance, anonymized research |
| Android/money-scope ADRs | `docs/decisions.md` or linked ADR files | Resolve conflicts explicitly; retain rejected options |
| Environment map and deploy fixes | `docs/production.md`, `docs/deployment.md`, workflows, Worker config | Commands tested against intended resources; no secret values |
| Provider contracts and permission tests | `worker/src/tests/`, sanitized fixtures, API docs | Positive/negative tests pass; provider version/date recorded |
| Real PHP runtime tests | `media-gateway/` and CI/staging jobs | Actual endpoint execution plus private/audio decisions |
| Browser/accessibility regression | Proposed `web/e2e/` and CI | Safe traces, correct fixtures, manual accessibility review |
| Android source/build instructions | Proposed `android/` and CI | Route-specific reproducibility and signed artifact provenance |
| Store declarations and screenshots | `store-listing/` and approved consoles | Match exact release; never invent review approval |
| Incident/recovery runbooks | Proposed `docs/operations/` | Named owner, tested commands, escalation and rehearsal |
| Release/acceptance record | Proposed `docs/releases/` or protected release system | Commit, migrations, test evidence, sign-offs, risks, rollout/recovery |

Do not commit credentials, keystores, live database dumps, identity documents, private proofs, generated build trees or large recordings. Use protected secret/artifact storage and existing ignore conventions.

## Risk register

| Risk | Initial severity | Early indicator | Mitigation / owner |
|---|---|---|---|
| Development profile deployed live | Critical | Mock payments, insecure cookie, config.production=false | R06; platform/release |
| False activation/refund or settlement mismatch | Critical | Provider/local disagreement | R10; finance/backend |
| Public private proofs/IDs | Critical | Unauthenticated private-file retrieval | R08/R11; security/media |
| Scam/impersonation and deposit/job abuse | Critical | Complaint clusters, false contacts | R14/R20; trust/safety |
| Silent recovery-email failure | High | Reset support and delivery backlog | R07/R21; backend/operations |
| Gateway/audio divergence | High | D1 passes but live driver rejects voice | R11; PHP/media |
| Store rejection or payment-policy conflict | High | Wrapper/purchase/deletion mismatch | R03/R09/R33; Android/compliance |
| Unrestorable data/media | Critical | No off-host copy or failed drill | R27; platform |
| Low-end/data-budget exclusion | High | Heavy media, failed uploads, poor task completion | R12/R22/R26/R31; frontend/QA |
| Misleading ROI | High | Taps presented as sales or message receipts | R02/R17/R24; product analytics |
| Serverless sitemap inventory loss | Medium–high | Cold-start inventory collapse | R23; web/platform |
| Signing/developer-account loss | High | Single custodian, missing recovery | R29/R32/R34; release |
| Scope sprawl/premature native rewrite | High | Parallel clients before decision, no pilot outcomes | R02/R03/R35; product/architecture |

## Weekly review and completion protocol

1. Review incidents, failed gates and P0 blockers first.
2. Update state, named owner, predecessor and evidence for work actually performed; preserve CODE versus ACCEPTED distinction.
3. Compare buyer/vendor outcomes to baseline. Checklist completion is not product success.
4. Reprioritize with a written reason; retain deferred task IDs and approved scope.
5. Check provider/channel changes, security advisories, support coverage and budget.
6. Close accepted tasks with dated reviewer evidence; select the next highest-value work for the following increment.
7. At release, export a read-only acceptance record and unresolved-risk list. Continue R35 after launch; maintenance has no permanent “finished forever” state.
