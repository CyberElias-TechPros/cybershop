# CyberShop — Feature Matrix (Phase 1 MVP)

Status legend: **Build** = implemented in this build · **P2** = Phase 2 · **Seed** = data-only for now.

| # | Feature | UI | API | DB | AuthN/Z | Validation | Error/Empty states | Tests | Status |
|---|---------|----|-----|----|---------|------------|--------------------|-------|--------|
| 1 | Vendor signup (business + owner account) | Wizard (business → category → WhatsApp → plan → pay) | register, create business | users, businesses, business_categories | Public (rate-limited) | email, phone, name, slug uniqueness | email taken, slug taken, quota errors | flow e2e | Build |
| 2 | Login / logout / session | Auth pages | login, logout, me | sessions, users | Session cookie | credentials, lockout after 5 fails | bad creds (generic msg), locked | auth tests | Build |
| 3 | Password reset | Request + reset forms | request, reset | users | Public (rate-limited) | email exists (no enumeration: generic msg) | success always shown | auth tests | Build |
| 4 | Admin auth (separate guard, /admin) | Admin login | same guard, role check | users(role=admin) | role=admin enforced server-side | — | forbidden | authz tests | Build |
| 5 | Activation fee payment — bank transfer | Proof upload + bank details shown | create payment intent, upload proof | payments, media(private) | vendor owns business | amount/plan match, proof MIME/size, dup-submit guard | pending, rejected+reason, resubmit | flow e2e | Build |
| 6 | Activation fee payment — Paystack | Paystack button (hosted page) | initiate, webhook (server-to-server verified) | payments | vendor | reference re-verified via Paystack API; never trust client | webhook failure logged, retry | webhook tests | Build (mock-mode fallback when no key) |
| 7 | Admin payment queue | Approve/Reject w/ proof viewer | approve, reject | payments, audit_logs | role=admin | reject requires reason | — | authz + flow tests | Build |
| 8 | Business lifecycle (auto-activate on approval) | Status banners | state machine in service layer | businesses.status, subscriptions | admin/vendor | legal transitions only | expired banner, noindex | flow tests | Build |
| 9 | Categories & field schemas CRUD (admin) | Category editor w/ field schema builder | full CRUD | categories | role=admin | schema JSON shape, required flags | — | CRUD tests | Build |
| 10 | Catalogue CRUD (dynamic form) | Add/Edit item, fields from category schema | full CRUD | listings | vendor owns business | per-field-type server validation, price, slug | draft/published, unsaved-changes warn | CRUD tests | Build |
| 11 | Item media (images) | Upload w/ progress, reorder, set primary | upload, attach, remove | media, item_media | vendor, quota check | magic-bytes MIME, ext, size, dims | upload failed state, quota warning | upload tests | Build |
| 12 | Quotas (storage/items/numbers) | Usage meter | enforced in services | usage_snapshots, plans.quota | server-side | plan + add-on totals | 80/90/100% warnings, block at 100% | quota tests | Build |
| 13 | Multiple WhatsApp numbers + labels | Numbers manager | CRUD | whatsapp_numbers | vendor | E.164 format, plan limit | dup number, limit reached | CRUD tests | Build |
| 14 | Per-item WhatsApp routing override | Number select on item form | part of item save | listings.whatsapp_number_id | vendor | number belongs to business | — | CRUD tests | Build |
| 15 | wa.me link builder + templates | CTA button everywhere | GET link (server-rendered) | message_templates | none (public) | number from DB never client | fallback to default number | link unit tests | Build |
| 16 | Inquiry (lead) capture on CTA click | — | POST /api/inquiries (or on render w/ nonce) | inquiries, analytics_events | optional buyer | nonce/dup guard, rate limit | — | unit + e2e | Build |
| 17 | Public homepage (discover) | Hero, search, categories, featured | — | — | public | — | empty (no businesses yet) | e2e | Build |
| 18 | Business directory + category pages | List w/ filters (basic) | — | — | public | — | empty per category | e2e | Build |
| 19 | Business storefront (SSR) | Profile, about, items, contact, OG | — | businesses, listings | public; noindex when not active | — | unavailable state (suspended/expired) | e2e + SEO checks | Build |
| 20 | Item page (SSR, OG, structured data) | Gallery, price, CTA, specs (custom fields) | — | listings, media | public; noindex when draft | — | 404, out-of-stock state | e2e + SEO checks | Build |
| 21 | Sitemap.xml + robots.txt | — | — | — | public | only indexable URLs | — | SEO tests | Build |
| 22 | Buyer optional account + favorites | My account, favorites | register(buyer), toggle fav | users, favorites | buyer session | — | guest: fav requires login (soft prompt) | flow tests | Build |
| 23 | Recently viewed | My account | — | recent_views | buyer | — | empty | unit | Build |
| 24 | Vendor dashboard overview | Stats (views, clicks, items), quick actions | — | analytics_daily, listings | vendor owner | — | onboarding empty state | e2e | Build |
| 25 | Vendor subscription/payment view | Plan status, next renewal, pay history, renew | — | subscriptions, payments | vendor | — | expiring/expired banners | e2e | Build |
| 26 | Vendor storefront settings | Name, slug, about, logo, cover, socials | update | businesses | vendor | slug reserved words, social URLs | — | CRUD tests | Build |
| 27 | Admin overview | Platform stats, pending queues | — | counts | admin | — | — | e2e | Build |
| 28 | Admin vendors CRUD (approve/suspend/reactivate) | List + detail + actions | full | businesses, audit_logs | admin | suspend requires note | — | authz + flow tests | Build |
| 29 | Admin listings oversight (takedown) | List all, archive | — | listings | admin | — | — | authz tests | Build |
| 30 | Admin plans & add-ons CRUD | Editors | full CRUD | plans, addons | admin | quota JSON, prices ≥ 0 | — | CRUD tests | Build |
| 31 | Reports/moderation queue | Report + resolve | create (any authed), resolve (admin) | reports | reporter any, resolve admin | reason required | — | flow tests | Build |
| 32 | Audit logs viewer | Filterable table | read-only | audit_logs | admin | — | — | e2e | Build |
| 33 | Notifications (in-app) | Bell + list | mark read | notifications | self | — | empty | unit | Build |
| 34 | Basic search (businesses + items) | Search box, results page | — | listings, businesses | public | input sanitize, limit | no results | e2e | Build |
| 35 | Rate limiting (login, register, reset, upload, inquiry) | — | middleware | — | — | per IP + account | 429 with message | security tests | Build |
| 36 | Structured data (Product/Service/Course/Event) | — | per item type | — | — | only real data, no fake reviews/ratings | — | SEO tests | Build |
| 37 | Media orphan cleanup job | — | cron | media.status | system | grace period ≥ 7 days | — | unit | Build |
| 38 | Subscription expiry check job | — | cron | subscriptions, businesses | system | grace config | — | unit | Build |
| 39 | Analytics daily rollup job | — | cron | analytics_daily | system | — | — | unit | Build |
| 40 | Seed data (categories, plans, add-ons, templates, item types) | — | seed command | all | system | idempotent | — | seed test | Seed |
| — | WhatsApp cart, CSV import/export, QR codes, leads CRM statuses UI | — | — | — | — | — | — | — | P2 |
| — | Staff accounts, custom domains, reviews, referrals, PWA | — | — | — | — | — | — | — | P3 |

## Critical-path test priority (order of implementation verification)
1. Signup → payment intent → (bank proof | Paystack mock) → admin approval → storefront live
2. Vendor adds item with dynamic fields + media → item published
3. Buyer opens item page → sees OG tags → CTA produces correct `wa.me` URL → inquiry logged
4. Vendor dashboard shows the inquiry + view/click stats
5. IDOR checks: vendor A cannot read/write vendor B's business, listings, media, payments
6. Paystack webhook: valid signature activates; tampered signature rejected + logged
