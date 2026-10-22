## Scope and traceability

- Roadmap IDs and intended achievement:
- Changed routes/services/platforms:
- Dependencies and compatibility/cutover requirements:
- Explicitly deferred work and remaining acceptance gates:

## Evidence

Record the exact source commit, runtime/tool versions, commands and actual results.
Link synthetic CI evidence; distinguish unit/integration/browser tests, physical-device
checks and provider/production acceptance. Do not paste secrets, private capabilities
or customer data. A checked item below is a review assertion, not automatic enforcement.

- [ ] Tests/typechecks/builds for changed surfaces pass; failures/skips are disclosed.
- [ ] Cross-tenant, anonymous, staff and suspended-account boundaries are tested where relevant.
- [ ] Multi-step writes, duplicate requests, concurrent calls and provider failures were reviewed.
- [ ] No live config, keys, keystores, session/reset tokens, private media or backups are committed.
- [ ] Migration ordering, backups, incompatible old writers and rollback limits are documented.
- [ ] Sensitive actions have server authorization, reason/audit and explicit confirmation where needed.
- [ ] Browser/mobile accessibility and failure/retry states were considered; untested devices are named.
- [ ] Roadmap states and evidence match the actual implementation, not assumed external acceptance.

## Release and recovery

- Deployment or external side effects performed (write **none** when none):
- Monitoring and safe recovery procedure:
- Owner approvals still required (finance/security/privacy/signing/provider/release):
- Independent reviewer and actual review outcome (leave pending until reviewed):
