# Traceability: every `plan.md` section -> this plan

Rule from BUILD_PLAN 25.1: no feature lands without a trace, and no plan.md idea is silently dropped. `plan.md`'s first half is numbered §0-§13 (there is no §12); the appended advisory pass is numbered 1-80. Both are covered below.

**Legend:** `->` = handled where noted · `P2/P3/P4` = deferred to that phase with a trigger in BUILD_PLAN 23 · `X` = explicitly rejected with reason.

## First half (the product plan)

| plan.md | Subject | Where |
|---|---|---|
| 0 | Confirmed decisions (optional buyer accts, multi WA numbers, tiers + add-ons, wa.me only, dual payments) | all adopted: 12.2, 8.4, 11.3, 8.1, 11.2 |
| 1 | Core concept (no payments/shipping/inventory logic) | 1, 1.1 |
| 2 | Roles buyer/vendor/admin | 5.1, 10.2 |
| 3 | Dynamic category system, JSON-schema-per-category, admin CRUD | 6 (whole section), 5.2 |
| 4 | WhatsApp purchase flow + OG preview strategy | 8.1-8.3, 15 |
| 5 | Vendor journey incl. activation fee + approval | 12.1, 11.2, 26 |
| 6 | Admin capabilities (CRUD, queues, CMS-lite, notifications, audit) | 13 |
| 7 | SFTP media storage | **modified**: 7 (signed gateway instead of SFTP-from-serverless; SFTP kept as fallback driver) |
| 8 | Data model high-level | 5, docs/DATA_MODEL.md |
| 9 | Tech stack (Next SSR for OG, Node or Laravel, PG/MySQL) | 2.2 (Next + Postgres; Laravel rejected, reason noted) |
| 10 | Feature suggestions (search, featured, analytics, i18n, reviews, share, QR, reminders, referral, bulk, lead status, subdomain, PWA) | 16, 11.3, 12, 23(i18n), 13(moderation), 14, 14, 17.1, 23, 14/12, 23(P3), 23 |
| 11 | Build phases 1-4 | 22 (M0-M17 mapping), 23 |
| 12 | *(absent in source)* | noted BUILD_PLAN 0.4 — nothing missing, numbering gap only |
| 13 | Production-readiness (13.1 security, 13.2 reliability, 13.3 UI states, 13.4 SEO, 13.5 design, 13.6 testing, 13.7 what not to adopt) | 10, 9.3, 18, 15, 18, 20, and 0/2.2 (the rejection is honored: no Workers/D1/R2/DO stack) |
| 13-end | Open question "PHP/Laravel vs Node?" | answered: Node/Next, because PHP+JS would split the language surface; shared host still used for media |

## Second half (advisory pass, ¶1-¶80)

| ¶ | Subject | Where |
|---|---|---|
| 1 | Core product, "vendor chooses what applies" | 1, 6.1 |
| 2 | Catalogue Type Engine, admin can create types | 6.1-6.3 |
| 3 | Business profile fields | 5.1 `businesses`, 12 settings |
| 4 | Multiple WhatsApp numbers + routing + monetization | 8.4, 11.3, 12 |
| 5 | WhatsApp purchase flow / message body | 8.2 |
| 6 | Cannot attach images via deeplink -> use URL + OG | 8.1, 15 |
| 7 | Don't call it an "order" | 1.1, 5.5 `inquiries` |
| 8 | Vendor dashboard, anti-ERP | 12 |
| 9 | Catalogue manager features (create..variants) | 12, 5.3 |
| 10 | Media manager + "Workers are not a server with an SFTP client" | 7.2 (this is the basis of the gateway decision) |
| 11 | Media abstraction interface | 7.1 |
| 12 | SFTP storage structure + media table | 7.3, 5.4 |
| 13 | Media security checks + random filenames | 7.2, 7.3, 10.3 |
| 14 | Public vs private media | 7.3, invariant I6 |
| 15 | Vendor registration + status list | 12.1, 5.1 `businesses.status`, 11.2 |
| 16 | Payment Intent system | 11.1 |
| 17 | Payment verification -> auto effects | 11.2 (single transaction) |
| 18 | Subscription engine (plans/features/quota) | 5.6, 11.3 |
| 19 | Usage-based monetization meter list | 6.4, 5.6 `usage_records` |
| 20 | Buyer accounts optional, guest path | 12.2, 14 |
| 21 | Buyer dashboard | 12.2 |
| 22 | Discovery marketplace, configurable categories | 14, 5.2 |
| 23 | Business categories CRUD + allowed types + SEO meta | 6.1, 13 |
| 24 | Dynamic custom fields + types + server validation | 6.2 |
| 25 | Catalogue templates | 5.2 `catalogue_templates`, 6.1 |
| 26 | Storefront builder (styles, not Wix) | 14, 23 |
| 27 | Landing page sections toggles | 12 storefront, 14 |
| 28 | Offers/promotions | 5.3 `offers`, M14 |
| 29 | Variants | 5.3, 8.2 (`{{variant}}`), M14 |
| 30 | WhatsApp cart | 8.5 |
| 31 | Lead management statuses | 5.5, 12 leads |
| 32 | CTA analytics, "engagement not sales" | 16 |
| 33 | Vendor analytics + ranges | 16, 12 |
| 34 | Admin roles + permission strings | 10.2, 13 |
| 35 | Admin dashboard + pending queues | 13 |
| 36 | Admin CRUD list | 13 (+ impersonation deferred, 13) |
| 37 | Verification system | 5.1 `is_verified`, 13 approvals |
| 38 | Reporting/moderation | 5.7 `reports`, 13 moderation, M15 |
| 39 | Audit logs | 5.7, 10, constitution 3 |
| 40 | Notification system, not mandatory V1 | 17.1 |
| 41 | Subscription expiry states, storefront "temporarily unavailable" | 11.3, 17.3 |
| 42 | Data lifecycle states, soft delete | 17.3, 5.8 |
| 43 | Search + filters (no ratings without mechanism) | 2.2 (FTS), 14, 15, 23 |
| 44 | SEO URLs and metadata | 15 |
| 45 | Schema.org aware of catalogue type | 15, 6.2 |
| 46 | Public vs dashboard vs admin separation | 4, 12, 13, 14 |
| 47 | Recommended architecture (Vercel+Worker+D1+cPanel) | **modified**: 2.2/3 — same intent, no Worker/D1; media on the shared host as you asked |
| 48 | What to use from Cloudflare (Workers/D1/KV/Queues/Cron/DO) | 2.2 rejection reasons, 17.2 (jobs instead of Queues), 23 triggers |
| 49 | Database model table list | 5 (superset; `catalogue_field_*` renamed to `field_definitions` family, `inquiries` kept) |
| 50 | Multi-tenant isolation | 5.8, invariant I1, 20 authz matrix |
| 51 | Team members + roles | 5.1 `business_members`, M15 |
| 52 | Custom domain premium | 5.1 `custom_domain`, M16 |
| 53 | QR codes | 14, M14 |
| 54 | Share tools | 14, M14 |
| 55 | Import/export | 4 `scripts/import-catalogue.ts`, M14 |
| 56 | Backup/recovery | 21.1 |
| 57 | Storage quotas + admin storage view | 7.4, 13 |
| 58 | Orphan cleanup grace period | 7.2 step 6, 17.3 |
| 59 | Onboarding wizard | 12.1 |
| 60 | Easy first product | 12 item editor, 12.1 |
| 61 | AI later | 23 (premium add-on, trigger) |
| 62 | WhatsApp message builder | 8.2, 12 |
| 63 | Smart routing rules | 8.4 |
| 64 | Vendor owns the customer relationship | 1, 17.3 (never silently destroy their leads) |
| 65 | Trust & safety | 10.3, 13 moderation, R9 |
| 66 | Security architecture list | 10 |
| 67 | Frontend design direction (immersive public, clear dashboards) | 18 |
| 68 | Public homepage concept | 14, 18 |
| 69 | Mobile importance, sticky CTA | 12, 14, 18 |
| 70 | Accessibility | 18, 20 axe |
| 71 | Product architecture modules | 4 (directory list mirrors it) |
| 72 | Phase 1 core MVP checklist | 22 M0-M8 (billing inert per your decision) |
| 73 | Phase 2 list | 22 M9-M14 |
| 74 | Phase 3 list | 22 M15-M16 |
| 75 | Phase 4 vision | 22 M17, 23 |
| 76 | Catalogue-first decision | 1, 6 |
| 77 | Core data relationship | 5, docs/DATA_MODEL.md ERD |
| 78 | Positioning wording | 1 |
| 79 | Master prompt as constitution + SFTP-not-R2 amendment | 25 (12 rules), 7.3/23 |
| 80 | Final diagram (platform + Worker/D1 under it) | 3 (adapted diagram), 2.2 |

## Things plan.md does not mention that this plan adds

These came from the platform reality check, not from the source doc: the Vercel Hobby commercial-use gate (2.3, R1), function-duration and bandwidth ceilings driving the upload path (7.2) and analytics batching (16), Postgres-over-D1 (ADR 0001), `wa_links` short-code redirect so clicks are actually countable (8.3), schema-versioning guardrails for the admin field builder (6.3, R5), idempotency/locking rules (9.3), the field-registry-as-single-source-of-truth (6.2), backup/restore rehearsal (21.1), and the launch gates (26).
