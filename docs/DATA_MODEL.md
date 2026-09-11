# Data model

`src/db/schema.ts` is the source of truth (constitution rule 5: schema is code, migrations in `drizzle/`). This file covers only what code cannot express: **why the shapes are these**, the index strategy, and the ERD.

```
USER ─┬─< BUSINESS_MEMBERS >─ BUSINESS ─┬─< CATALOGUE_ITEMS ─┬─< ITEM_FIELD_VALUES >─ FIELD_DEFINITIONS
      │                                 │                    ├─< ITEM_MEDIA >─ MEDIA
      └─< USER_ROLES >─ ROLE ─< ROLE_PERMISSIONS >─ PERMISSION│                    └─ variants, offers, item_tags
                                        ├─< WHATSAPP_NUMBERS ─┴─< WHATSAPP_ROUTING
                                        ├─< WA_LINKS ─< INQUIRIES ─< INQUIRY_ITEMS / INQUIRY_EVENTS
                                        ├─< SUBSCRIPTIONS >─ PLANS ─< PLAN_QUOTAS / PLAN_FEATURES
                                        ├─< PAYMENTS ─> MEDIA (proof)      └─ ADDON_PURCHASES >─ ADDONS
                                        └─< BUSINESS_TYPES ─< BUSINESS_TYPE_CATALOGUE_TYPES >─ CATALOGUE_TYPES
CATALOGUE_TYPES ─< CATALOGUE_TEMPLATES        CATEGORIES (tree, self-FK)
PLATFORM: AUDIT_LOGS, NOTIFICATIONS, REPORTS, REVIEWS, FAVORITES, RECENT_VIEWS,
          ANALYTICS_EVENTS → ANALYTICS_DAILY, JOBS, OUTBOX, PLATFORM_SETTINGS
```

## The five decisions worth arguing about

**1. One `catalogue_items` table, not one per vertical.** Verticals are rows (`catalogue_types`) with field schemas (`field_definitions`), because the requirement is "any business, no redesign" (plan.md 3, 25). Cost: filters need EAV. Paid back by keeping `name/price/status/slug` as real columns so 90% of queries never touch JSON.

**2. `item_field_values` carries three projections.** Every stored value also writes `value_text` (search + human label), `value_num` (bounds/ranges) and `value_json` (exact match, arrays). A discovery filter becomes `EXISTS (SELECT 1 FROM item_field_values WHERE item_id = i.id AND field_definition_id = $known AND value_json = $x::jsonb)` — one index, one purpose. Never `WHERE value->>'x' = ...` across an unbounded key space.

**3. `field_definitions` belongs to the platform, `item_field_values` to the item.** An admin editing a schema never rewrites item rows. Retiring a field sets `deprecated_at`; old values survive and stay hidden — which is plan.md 42's data-lifecycle answer for an EAV store.

**4. `payments` is the only mutable money row, and `media` holds metadata only.** The DB never stores bytes (invariant I5), and payment status transitions happen inside one transaction that also sets the subscription, the business status, the audit row and the notification (invariant I3).

**5. `wa_links` exists so a click is observable.** `analytics_events` counts what the platform can see; `inquiries` is the CRM record. Neither pretends to know whether a sale happened.

## Index strategy

| Access pattern | Index |
|---|---|
| item page by URL | `catalogue_items (business_id, slug)` unique |
| discovery list | `(status, business_id)`, `(business_id, status, created_at desc)`, `(category_id)`, `(catalogue_type_id, status)` |
| EAV filter | `item_field_values (field_definition_id, value_num)`, `(field_definition_id, value_json)`, GIN-ready `(value_text)` |
| public only | `businesses (status, visibility, city)` — every public query also filters `deleted_at is null` |
| lead board | `inquiries (business_id, status, created_at)` |
| payment queue | `payments (status, submitted_at)`; `reference` and `idempotency_key` unique |
| orphan sweep | `media (status, last_seen_at)`; dedupe on `(business_id, checksum)` |
| admin history | `audit_logs (resource, resource_id, created_at)`, `(actor_user_id, created_at)` |
| analytics | `analytics_events (business_id, kind, ts)`, `(item_id, kind, ts)`; rollups PK'd on `(business_id, item_id, day, metric)` |

Constraints that carry real meaning rather than tidiness:

- `whatsapp_numbers` partial unique `(business_id) WHERE is_default` — exactly one default number per business, enforced in the database, not in a code path.
- `field_definitions` unique on `(catalogue_type_id, coalesce(business_id,''), key)` — a business's custom field cannot shadow a platform field, and two businesses cannot collide.
- `reviews` `CHECK (rating between 1 and 5)` + unique per buyer/business — one review each, and the table exists only so that ratings can arrive with a real mechanism (plan.md 43).
- `analytics_daily.item_id` is `NOT NULL DEFAULT zero-uuid` because a primary key cannot contain NULL; the zero uuid means "business-level rollup".

## Multi-tenancy

`business_id` is NOT NULL on every tenant-owned table. Reads go through `src/db/read.ts`; writes go through Server Actions that call `requireMembership(businessId, permission)` — membership and permission in the same check, so forgetting one is not possible by omission. The authz matrix test enumerates every action × role and asserts foreign tenants get 403 (BUILD_PLAN 20).

## Growth notes (what breaks first, and the fix)

- `analytics_events` is the only table expected to reach tens of millions of rows: monthly partitions, 90-day retention, hourly rollup. Add declarative partitioning when it passes ~10M.
- `search` is a denormalised `text` haystack with `ILIKE` for now. Postgres FTS (`tsvector` + GIN) is the drop-in upgrade at >50k items; Meilisearch only if search relevance becomes the product.
- Soft-deleted rows accumulate in `catalogue_items`; `media.purge_business` and a 90-day purge job are the reclamation path (BUILD_PLAN 17.3).
