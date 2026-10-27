# Contributing and review rules

These are repository review requirements, not a claim that GitHub branch protection,
production-environment reviewers or named owners have been configured. The owner
must assign actual reviewers and enforce repository/environment controls separately.

## Before changing code

1. Work against the agreed roadmap IDs in `docs/roadmap/tasks.csv`. State the
   purpose, affected persona, dependencies and concrete acceptance evidence.
2. Inspect existing implementation/tests first. Separate source changes, automated
   nonproduction verification and actual provider/device/production acceptance.
3. Use isolated synthetic data. Do not connect a local test to production D1,
   production media or live payment credentials. No production mutation or store
   upload is implied by passing tests or merging code.
4. Use the pinned lockfiles and documented runtime/toolchain. The Worker and web
   packages have independent install/build/test commands; there is no root npm
   package. Android setup and identity/signing gates are in `android/README.md`.

## Mandatory review areas

| Area | Review requirement | Evidence / connection |
|---|---|---|
| Secrets and private data | No live configuration, credentials, key stores, tokens, customer files or plaintext backups in source/artifacts. Inspect the staged diff and ignore behavior. Redact logs and screenshots before sharing. | `.gitignore`, gateway ignores, synthetic test fixtures, artifact paths/retention |
| Identity and tenancy | Enforce authentication, role, object ownership and business boundaries on the server; UI hiding is not authorization. Include anonymous, other-tenant and least-privilege negative tests. | Worker routes, session/2FA and test harness |
| Money and entitlements | Verify authoritative provider reference/currency/amount/status; never infer payment from a browser return. Review atomicity, held credit, duplicates, races and failure recovery. Keep financial moderation/refunds distinct from provider cash movement. | Payment migrations/ledger, webhook and recovery tests; finance review |
| Database and media changes | Explain additive versus incompatible rollout, old-writer behavior, backups and actual rollback limits. Test insert/update failures and concurrent quota/uniqueness boundaries. Do not delete live data to make a migration pass. | D1 migrations, media gateway protocol, release-safety runbook |
| Sensitive operations | Require server-side authorization and suitable confirmation/reason/audit for staff actions. Never weaken verification, fabricate a certificate, expose private proof or make a live charge to bypass a failing test. | Admin/health/billing routes, signing gate, acceptance register |
| Tests and UX | Test changed behavior and regressions; disclose skips/flakes and exact commands. Include accessible loading/error/retry states. Viewport emulation is not physical Android or TalkBack evidence. | Worker suites, PHP HTTP tests, Playwright, Android unit/lint/build |
| Deployment and recovery | Link the exact tested commit and cutover procedure. Name unproven provider, DNS, hosting, financial, privacy, signing and store gates. Obtain actual authorized release approval. | `docs/operations/release-safety.md`, protected deployment workflow |

Use `.github/pull_request_template.md`. A non-author reviewer must review sensitive
changes before release. Security, finance, privacy and signing decisions require an
authorized domain owner; an automated agent or green CI cannot stand in for them.
Do not fill in an approval/reviewer field before the review actually occurs.

## Verification record

For each verification batch record source commit, date/time/timezone, Node/npm or
JDK/SDK/PHP versions, lockfile checksums, commands, exit statuses and counts. Keep
private/raw production evidence out of Git. Local logs/build output are disposable;
link a retained synthetic CI run for longer-lived evidence. A source-only change
must not silently promote a provider/device acceptance task to complete.

Typical nonproduction checks (run from their specified package directory):

```sh
node --test scripts/tests/*.test.mjs
python3 scripts/check-roadmap.py
npm --prefix worker run typecheck
npm --prefix worker test
npm --prefix web run typecheck
npm --prefix web run build
npm --prefix web run test:e2e
node scripts/web-audit/jsx-nesting.mjs web
node scripts/web-audit/css-budget.mjs web
```

Consult package scripts first; do not run two builds against the same web `.next`
directory concurrently. Native PHP with GD is needed for the real gateway suite;
see the release runbook for the explicitly optional local WASM fallback. Android
CI builds the separate internal identity, not an approved signed store binary.

## Reporting defects

Use the defect form for persona, sanitized route, environment/device, steps,
expected/actual behavior, impact and synthetic evidence. Do not publish suspected
vulnerability details or private payment/account data. Confirm an owner-approved
private contact before sharing sensitive evidence. The public defect form is not
a newly provisioned private security intake or a staffed response SLA.
