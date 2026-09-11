/**
 * Cybershop schema — BUILD_PLAN.md §5. This file is the source of truth for the
 * data model (constitution rule 5: schema is code). Conventions:
 *  - id: uuid v7 (time-sortable), timestamptz everywhere
 *  - money: numeric + 3-letter currency; never float
 *  - every tenant-owned row carries business_id (invariant I1)
 *  - soft delete via deleted_at + partial uniques
 */
import {
  bigint, boolean, char, date, index, integer, jsonb, numeric, pgEnum, pgTable,
  primaryKey, smallint, text, timestamp, unique, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { AnyPgColumn, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** sentinel for "no item" in rollup tables (a PK cannot contain NULL) */
export const NO_ITEM = "00000000-0000-0000-0000-000000000000";

/* ------------------------------ enums ------------------------------ */
export const userStatus = pgEnum("user_status", ["active", "suspended", "deleted"]);
export const businessStatus = pgEnum("business_status", [
  "pending_registration", "pending_payment", "payment_submitted", "under_review",
  "active", "suspended", "expired", "cancelled", "rejected",
]);
export const businessVisibility = pgEnum("business_visibility", ["public", "unlisted", "private"]);
export const itemStatus = pgEnum("item_status", ["draft", "published", "unpublished", "archived", "scheduled"]);
export const priceType = pgEnum("price_type", ["fixed", "from", "range", "on_request", "free"]);
export const mediaVisibility = pgEnum("media_visibility", ["public", "private"]);
export const mediaStatus = pgEnum("media_status", ["uploading", "available", "attached", "unused", "deleted", "failed"]);
export const leadStatus = pgEnum("lead_status", ["new", "contacted", "interested", "negotiating", "converted", "lost"]);
export const paymentMethod = pgEnum("payment_method", ["bank_transfer", "paystack", "manual", "free"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "verified", "rejected", "failed", "refunded"]);
export const paymentKind = pgEnum("payment_kind", ["activation", "subscription", "addon"]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing", "active", "past_due", "grace", "expired", "cancelled", "suspended",
]);
export const planInterval = pgEnum("plan_interval", ["monthly", "yearly"]);
export const addonKind = pgEnum("addon_kind", [
  "extra_number", "extra_storage", "extra_seat", "featured", "custom_domain", "extra_category", "api",
]);
export const quotaResource = pgEnum("quota_resource", [
  "catalogue_items", "whatsapp_numbers", "staff_seats", "media_bytes", "categories",
  "custom_fields", "featured_slots", "locations", "api_calls", "analytics_retention_days", "offers",
]);
export const reportStatus = pgEnum("report_status", ["open", "investigating", "resolved", "dismissed"]);
export const jobStatus = pgEnum("job_status", ["queued", "running", "done", "failed"]);

/* ------------------------------ identity + tenancy ------------------------------ */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  status: userStatus("status").notNull().default("active"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`)]);

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull(),
  description: text("description"),
  isPlatform: boolean("is_platform").notNull().default(false),
}, (t) => [uniqueIndex("roles_key_uq").on(t.key)]);

export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull(),
}, (t) => [uniqueIndex("permissions_key_uq").on(t.key)]);

export const rolePermissions = pgTable("role_permissions", {
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })]);

/** businessId null = platform-wide role (admin staff); non-null = vendor team role */
export const userRoles = pgTable("user_roles", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("user_roles_uq").on(t.userId, t.roleId, t.businessId)]);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)]);

export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  tagline: text("tagline"),
  description: text("description"),
  logoMediaId: uuid("logo_media_id"),
  coverMediaId: uuid("cover_media_id"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  country: char("country", { length: 2 }).notNull().default("NG"),
  serviceArea: text("service_area"),
  openingHours: jsonb("opening_hours"),
  socials: jsonb("socials"),
  registrationNo: text("registration_no"),
  policies: jsonb("policies"),
  faqs: jsonb("faqs"),
  currency: char("currency", { length: 3 }).notNull().default("NGN"),
  timezone: text("timezone").notNull().default("Africa/Lagos"),
  status: businessStatus("status").notNull().default("pending_registration"),
  visibility: businessVisibility("visibility").notNull().default("public"),
  isVerified: boolean("is_verified").notNull().default(false),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedBy: uuid("verified_by").references(() => users.id),
  /** { style, sections[], accent, typography, heroMode } — BUILD_PLAN 14 */
  storefront: jsonb("storefront").notNull().default({ style: "classic", sections: ["hero", "featured", "catalogue", "about", "contact"] }),
  onboardingStep: integer("onboarding_step").notNull().default(1),
  customDomain: text("custom_domain"),
  visibilityPausedByVendor: boolean("visibility_paused_by_vendor").notNull().default(false),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("businesses_slug_uq").on(t.slug),
  index("businesses_status_idx").on(t.status),
  index("businesses_discover_idx").on(t.status, t.visibility, t.city),
]);

export const businessMembers = pgTable("business_members", {
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => roles.id),
  status: text("status").notNull().default("active"),
  invitedBy: uuid("invited_by").references(() => users.id),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.businessId, t.userId] }), index("members_user_idx").on(t.userId)]);

export const businessTypes = pgTable("business_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  icon: text("icon"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [uniqueIndex("business_types_key_uq").on(t.key)]);

/** catalogue types are the verticals' shapes; allowedCatalogueTypes lives on business_types */
export const businessTypeCatalogueTypes = pgTable("business_type_catalogue_types", {
  businessTypeId: uuid("business_type_id").notNull().references(() => businessTypes.id, { onDelete: "cascade" }),
  catalogueTypeId: uuid("catalogue_type_id").notNull().references(() => catalogueTypes.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.businessTypeId, t.catalogueTypeId] })]);

/* ------------------------------ catalogue engine (BUILD_PLAN 6) ------------------------------ */
export const catalogueTypes = pgTable("catalogue_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull(),               // product | service | course | event | property | ...
  name: text("name").notNull(),
  itemNoun: text("item_noun").notNull(),     // "Product"
  itemNounPlural: text("item_noun_plural").notNull(),
  ctaVerb: text("cta_verb").notNull(),       // "Purchase" | "Enquire" | "Register interest"
  /** which schema.org type to emit on item pages (BUILD_PLAN 15) */
  schemaKind: text("schema_kind").notNull().default("Product"),
  /** media rules for this type: { images:{max,required}, video:{allowed,maxBytes} } */
  mediaRules: jsonb("media_rules").notNull().default({ images: { max: 10 }, video: { allowed: false } }),
  schemaVersion: integer("schema_version").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [uniqueIndex("catalogue_types_key_uq").on(t.key)]);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, { onDelete: "set null" }),
  businessTypeId: uuid("business_type_id").references(() => businessTypes.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  icon: text("icon"),
  description: text("description"),
  allowedCatalogueTypes: jsonb("allowed_catalogue_types").notNull().default([]),
  seo: jsonb("seo"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [uniqueIndex("categories_slug_uq").on(t.slug), index("categories_parent_idx").on(t.parentId)]);

export const fieldDefinitions = pgTable("field_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  catalogueTypeId: uuid("catalogue_type_id").notNull().references(() => catalogueTypes.id, { onDelete: "cascade" }),
  /** null = platform-wide definition; set = a business's own extra field (BUILD_PLAN 6.1) */
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  helpText: text("help_text"),
  type: text("type").notNull(),             // key into src/core/fields.ts registry
  isRequired: boolean("is_required").notNull().default(false),
  isPublic: boolean("is_public").notNull().default(true),
  isFilterable: boolean("is_filterable").notNull().default(false),
  isSearchable: boolean("is_searchable").notNull().default(false),
  /** maps this field to a column on catalogue_items instead of EAV (e.g. price, sku) */
  mapsTo: text("maps_to"),
  placeholder: text("placeholder"),
  defaultValue: jsonb("default_value"),
  config: jsonb("config").notNull().default({}),
  validation: jsonb("validation").notNull().default({}),
  sortOrder: integer("sort_order").notNull().default(0),
  deprecatedAt: timestamp("deprecated_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("field_defs_key_uq").on(t.catalogueTypeId, sql`coalesce(${t.businessId}::text, '')`, t.key),
  index("field_defs_type_idx").on(t.catalogueTypeId, t.deprecatedAt),
]);

export const fieldOptions = pgTable("field_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  fieldDefinitionId: uuid("field_definition_id").notNull().references(() => fieldDefinitions.id, { onDelete: "cascade" }),
  value: text("value").notNull(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [index("field_options_field_idx").on(t.fieldDefinitionId)]);

export const catalogueTemplates = pgTable("catalogue_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  businessTypeId: uuid("business_type_id").references(() => businessTypes.id, { onDelete: "cascade" }),
  catalogueTypeId: uuid("catalogue_type_id").notNull().references(() => catalogueTypes.id, { onDelete: "cascade" }),
  fieldKeys: jsonb("field_keys").notNull().default([]),
  preset: jsonb("preset").notNull().default({}),
  isOfficial: boolean("is_official").notNull().default(true),
}, (t) => [index("catalogue_templates_bt_idx").on(t.businessTypeId)]);

export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  entityKind: text("entity_kind").notNull(),   // item_image|item_video|item_doc|business_logo|business_cover|payment_proof|kyc|export|avatar
  entityRef: uuid("entity_ref"),
  storageKey: text("storage_key").notNull(),
  publicUrl: text("public_url"),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  extension: text("extension").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  width: integer("width"),
  height: integer("height"),
  durationMs: integer("duration_ms"),
  checksum: text("checksum").notNull(),
  altText: text("alt_text"),
  caption: text("caption"),
  role: text("role").notNull().default("gallery"),
  variants: jsonb("variants").notNull().default({}),
  visibility: mediaVisibility("visibility").notNull().default("public"),
  status: mediaStatus("status").notNull().default("available"),
  quotaCharged: boolean("quota_charged").notNull().default(false),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  attachedAt: timestamp("attached_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("media_key_uq").on(t.storageKey),
  index("media_business_status_idx").on(t.businessId, t.status),
  index("media_orphan_idx").on(t.status, t.lastSeenAt),
  index("media_dedupe_idx").on(t.businessId, t.checksum),
]);

export const catalogueItems = pgTable("catalogue_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  catalogueTypeId: uuid("catalogue_type_id").notNull().references(() => catalogueTypes.id),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  templateId: uuid("template_id").references(() => catalogueTemplates.id, { onDelete: "set null" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  summary: text("summary"),
  descriptionHtml: text("description_html"),
  descriptionText: text("description_text"),
  status: itemStatus("status").notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  isFeatured: boolean("is_featured").notNull().default(false),
  featuredUntil: timestamp("featured_until", { withTimezone: true }),
  isOutOfStock: boolean("is_out_of_stock").notNull().default(false),
  price: numeric("price", { precision: 14, scale: 2 }),
  priceMax: numeric("price_max", { precision: 14, scale: 2 }),
  priceType: priceType("price_type").notNull().default("fixed"),
  currency: char("currency", { length: 3 }).notNull().default("NGN"),
  sku: text("sku"),
  stockQty: integer("stock_qty"),
  whatsappNumberId: uuid("whatsapp_number_id"),
  seo: jsonb("seo"),
  search: text("search"),                   // denormalised FTS haystack (name+summary+description+values)
  viewCount: integer("view_count").notNull().default(0),
  clickCount: integer("click_count").notNull().default(0),
  position: integer("position").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("items_slug_uq").on(t.businessId, t.slug),
  index("items_public_idx").on(t.status, t.businessId),
  index("items_type_idx").on(t.catalogueTypeId, t.status),
  index("items_category_idx").on(t.categoryId),
  index("items_business_status_idx").on(t.businessId, t.status, t.createdAt),
]);

/** EAV values with typed projections so filters never scan raw JSONB (BUILD_PLAN 5.2) */
export const itemFieldValues = pgTable("item_field_values", {
  itemId: uuid("item_id").notNull().references(() => catalogueItems.id, { onDelete: "cascade" }),
  fieldDefinitionId: uuid("field_definition_id").notNull().references(() => fieldDefinitions.id, { onDelete: "cascade" }),
  value: jsonb("value").notNull(),
  valueText: text("value_text"),
  valueNum: numeric("value_num", { precision: 18, scale: 4 }),
  valueJson: jsonb("value_json"),
}, (t) => [
  primaryKey({ columns: [t.itemId, t.fieldDefinitionId] }),
  index("ifv_field_num_idx").on(t.fieldDefinitionId, t.valueNum),
  index("ifv_field_json_idx").on(t.fieldDefinitionId, t.valueJson),
  index("ifv_item_idx").on(t.itemId),
]);

export const itemMedia = pgTable("item_media", {
  itemId: uuid("item_id").notNull().references(() => catalogueItems.id, { onDelete: "cascade" }),
  mediaId: uuid("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("gallery"),
  sortorder: integer("sort_order").notNull().default(0),
  caption: text("caption"),
}, (t) => [primaryKey({ columns: [t.itemId, t.mediaId] }), index("item_media_sort_idx").on(t.itemId, t.sortorder)]);

export const variants = pgTable("variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id").notNull().references(() => catalogueItems.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sku: text("sku"),
  price: numeric("price", { precision: 14, scale: 2 }),
  stockQty: integer("stock_qty"),
  isAvailable: boolean("is_available").notNull().default(true),
  options: jsonb("options").notNull().default({}),  // { "colour":"Black","size":"Large" }
}, (t) => [index("variants_item_idx").on(t.itemId)]);

export const offers = pgTable("offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").references(() => catalogueItems.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("discount"),
  title: text("title").notNull(),
  description: text("description"),
  percentOff: numeric("percent_off", { precision: 5, scale: 2 }),
  amountOff: numeric("amount_off", { precision: 14, scale: 2 }),
  priceOverride: numeric("price_override", { precision: 14, scale: 2 }),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  usageLimit: integer("usage_limit"),
  usedCount: integer("used_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  terms: text("terms"),
}, (t) => [index("offers_active_idx").on(t.isActive, t.startsAt, t.endsAt)]);

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
}, (t) => [uniqueIndex("tags_slug_uq").on(t.slug)]);

export const itemTags = pgTable("item_tags", {
  itemId: uuid("item_id").notNull().references(() => catalogueItems.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.itemId, t.tagId] })]);

/* ------------------------------ WhatsApp (BUILD_PLAN 8) ------------------------------ */
export const whatsappNumbers = pgTable("whatsapp_numbers", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  label: text("label").notNull().default("General"),
  e164: text("e164").notNull(),             // encrypted at rest in prod; plaintext here for phase 1
  e164Hmac: text("e164_hmac"),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  source: text("source").notNull().default("plan"),   // plan | addon
  addonPurchaseId: uuid("addon_purchase_id"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("wa_num_business_idx").on(t.businessId, t.isActive),
  uniqueIndex("wa_num_business_default_uq").on(t.businessId).where(sql`is_default = true`),
]);

export const whatsappRouting = pgTable("whatsapp_routing", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  matchType: text("match_type").notNull(),   // item | category | catalogue_type | offer | fallback
  matchRef: uuid("match_ref"),
  whatsappNumberId: uuid("whatsapp_number_id").notNull().references(() => whatsappNumbers.id, { onDelete: "cascade" }),
  priority: integer("priority").notNull().default(100),
}, (t) => [index("wa_routing_biz_idx").on(t.businessId, t.priority)]);

export const waTemplates = pgTable("wa_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  scope: text("scope").notNull().default("platform"),  // platform | business | category | catalogue_type
  refId: uuid("ref_id"),
  kind: text("kind").notNull().default("purchase_enquiry"),
  name: text("name").notNull(),
  bodyText: text("body_text").notNull(),
  variables: jsonb("variables").notNull().default([]),
  locale: text("locale").notNull().default("en"),
  isActive: boolean("is_active").notNull().default(true),
  /** validate {{var}} references at save time (BUILD_PLAN 8.2) */
}, (t) => [index("wa_tpl_lookup_idx").on(t.scope, t.kind, t.refId)]);

export const waLinks = pgTable("wa_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").references(() => catalogueItems.id, { onDelete: "cascade" }),
  whatsappNumberId: uuid("whatsapp_number_id").references(() => whatsappNumbers.id, { onDelete: "set null" }),
  templateId: uuid("template_id").references(() => waTemplates.id, { onDelete: "set null" }),
  messageSnapshot: text("message_snapshot").notNull(),
  targetUrl: text("target_url").notNull(),
  hitCount: integer("hit_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [uniqueIndex("wa_links_code_uq").on(t.code), index("wa_links_biz_idx").on(t.businessId, t.createdAt)]);

export const inquiries = pgTable("inquiries", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").references(() => catalogueItems.id, { onDelete: "set null" }),
  waLinkId: uuid("wa_link_id").references(() => waLinks.id, { onDelete: "set null" }),
  whatsappNumberId: uuid("whatsapp_number_id").references(() => whatsappNumbers.id, { onDelete: "set null" }),
  buyerUserId: uuid("buyer_user_id").references(() => users.id, { onDelete: "set null" }),
  visitorId: text("visitor_id"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  message: text("message").notNull(),
  status: leadStatus("status").notNull().default("new"),
  amountEstimated: numeric("amount_estimated", { precision: 14, scale: 2 }),
  outcomeNote: text("outcome_note"),
  source: text("source").notNull().default("item_page"),
  statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("inquiries_business_status_idx").on(t.businessId, t.status, t.createdAt),
  index("inquiries_item_idx").on(t.itemId),
]);

export const inquiryItems = pgTable("inquiry_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  inquiryId: uuid("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").references(() => catalogueItems.id, { onDelete: "set null" }),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }),
  variantLabel: text("variant_label"),
  nameSnapshot: text("name_snapshot").notNull(),
}, (t) => [index("inquiry_items_inquiry_idx").on(t.inquiryId)]);

export const inquiryEvents = pgTable("inquiry_events", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity({ name: "inquiry_events_id_seq" }).primaryKey(),
  inquiryId: uuid("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),     // cta_click | app_opened | web_opened | copied
  meta: jsonb("meta").notNull().default({}),
  createdAt: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("inquiry_events_inquiry_idx").on(t.inquiryId, t.kind)]);

/* ------------------------------ billing (inert in phase 1) ------------------------------ */
export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  priceMinor: integer("price_minor").notNull().default(0),   // kobo
  currency: char("currency", { length: 3 }).notNull().default("NGN"),
  interval: planInterval("interval").notNull().default("monthly"),
  trialDays: integer("trial_days").notNull().default(0),
  isPublic: boolean("is_public").notNull().default(true),
  requiresActivationPayment: boolean("requires_activation_payment").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  description: text("description"),
}, (t) => [uniqueIndex("plans_code_uq").on(t.code)]);

export const planQuotas = pgTable("plan_quotas", {
  planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  resource: quotaResource("resource").notNull(),
  softLimitPct: integer("soft_limit_pct").notNull().default(80),
  /** null = unlimited. bigint: media_bytes quotas exceed int4 quickly */
  quotaLimit: bigint("quota_limit", { mode: "number" }),
}, (t) => [primaryKey({ columns: [t.planId, t.resource] })]);

export const planFeatures = pgTable("plan_features", {
  planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  featureKey: text("feature_key").notNull(),
  value: jsonb("value").notNull().default({ "on": true }),
}, (t) => [primaryKey({ columns: [t.planId, t.featureKey] })]);

export const addons = pgTable("addons", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  kind: addonKind("kind").notNull(),
  priceMinor: integer("price_minor").notNull(),
  currency: char("currency", { length: 3 }).notNull().default("NGN"),
  interval: planInterval("interval").notNull().default("monthly"),
  quotaDelta: jsonb("quota_delta").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"),
}, (t) => [uniqueIndex("addons_code_uq").on(t.code)]);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").notNull().references(() => plans.id),
  status: subscriptionStatus("status").notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  graceEndsAt: timestamp("grace_ends_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  activationMode: text("activation_mode").notNull().default("manual"), // manual | paystack
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("subs_business_idx").on(t.businessId, t.status), index("subs_expiry_idx").on(t.status, t.currentPeriodEnd)]);

export const subscriptionItems = pgTable("subscription_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),      // plan | addon
  refId: uuid("ref_id").notNull(),
  priceMinor: integer("price_minor").notNull(),
  quantity: integer("quantity").notNull().default(1),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (t) => [index("sub_items_sub_idx").on(t.subscriptionId)]);

export const addonPurchases = pgTable("addon_purchases", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  addonId: uuid("addon_id").notNull().references(() => addons.id),
  status: text("status").notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  autoRenew: boolean("auto_renew").notNull().default(false),
}, (t) => [index("addon_purchases_biz_idx").on(t.businessId, t.status)]);

export const usageRecords = pgTable("usage_records", {
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  resource: quotaResource("resource").notNull(),
  used: bigint("used", { mode: "number" }).notNull().default(0),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.businessId, t.resource] })]);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id),
  kind: paymentKind("kind").notNull(),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
  addonPurchaseId: uuid("addon_purchase_id").references(() => addonPurchases.id, { onDelete: "set null" }),
  amountMinor: integer("amount_minor").notNull(),
  currency: char("currency", { length: 3 }).notNull().default("NGN"),
  method: paymentMethod("method").notNull(),
  reference: text("reference").notNull(),
  externalRef: text("external_ref"),
  status: paymentStatus("status").notNull().default("pending"),
  proofMediaId: uuid("proof_media_id").references(() => media.id, { onDelete: "set null" }),
  payerNote: text("payer_note"),
  rejectionReason: text("rejection_reason"),
  idempotencyKey: text("idempotency_key"),
  gatewayPayload: jsonb("gateway_payload"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedBy: uuid("verified_by").references(() => users.id),
}, (t) => [
  uniqueIndex("payments_reference_uq").on(t.reference),
  uniqueIndex("payments_idem_uq").on(t.idempotencyKey),
  index("payments_queue_idx").on(t.status, t.submittedAt),
]);

/* ------------------------------ trust, ops, analytics ------------------------------ */
export const auditLogs = pgTable("audit_logs", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity({ name: "audit_logs_id_seq" }).primaryKey(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  actorKind: text("actor_kind").notNull(),      // user | system | cron | webhook
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: text("resource_id"),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("audit_resource_idx").on(t.resource, t.resourceId, t.createdAt),
  index("audit_actor_idx").on(t.actorUserId, t.createdAt),
  index("audit_created_idx").on(t.createdAt),
]);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  data: jsonb("data").notNull().default({}),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("notif_user_idx").on(t.userId, t.readAt, t.createdAt)]);

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterUserId: uuid("reporter_user_id").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),         // business | item | media | profile | spam
  subjectId: uuid("subject_id").notNull(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
  reasonCode: text("reason_code").notNull(),
  detail: text("detail"),
  status: reportStatus("status").notNull().default("open"),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  resolutionNote: text("resolution_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => [index("reports_status_idx").on(t.status, t.createdAt)]);

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  buyerUserId: uuid("buyer_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rating: smallint("rating").notNull(),
  body: text("body"),
  isSelfReported: boolean("is_self_reported").notNull().default(false),
  status: text("status").notNull().default("pending"),
  businessReply: text("business_reply"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("reviews_uq").on(t.businessId, t.buyerUserId),
  check("reviews_rating_range", sql`${t.rating} >= 1 AND ${t.rating} <= 5`),
]);

export const favorites = pgTable("favorites", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").references(() => catalogueItems.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("favorites_user_idx").on(t.userId, t.createdAt)]);

export const recentViews = pgTable("recent_views", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").notNull().references(() => catalogueItems.id, { onDelete: "cascade" }),
  viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.itemId] })]);

export const analyticsEvents = pgTable("analytics_events", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity({ name: "analytics_events_id_seq" }).primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").references(() => catalogueItems.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  sessionKeyHash: text("session_key_hash"),
  visitorId: text("visitor_id"),
  source: text("source"),
  referrer: text("referrer"),
  device: text("device"),
  country: text("country"),
  createdAt: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("analytics_biz_time_idx").on(t.businessId, t.kind, t.createdAt),
  index("analytics_item_time_idx").on(t.itemId, t.kind, t.createdAt),
]);

export const analyticsDaily = pgTable("analytics_daily", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  /** zero uuid = business-level rollup (a PK cannot contain NULL) */
  itemId: uuid("item_id").notNull().default(NO_ITEM),
  day: date("day").notNull(),
  metric: text("metric").notNull(),
  value: bigint("value", { mode: "number" }).notNull().default(0),
}, (t) => [
  uniqueIndex("analytics_daily_uq").on(t.businessId, t.itemId, t.day, t.metric),
  index("analytics_daily_biz_day_idx").on(t.businessId, t.day),
]);

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull().default({}),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  status: jobStatus("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  dedupeKey: text("dedupe_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("jobs_dedupe_uq").on(t.dedupeKey),
  index("jobs_due_idx").on(t.status, t.runAt),
]);

export const outbox = pgTable("outbox", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity({ name: "outbox_id_seq" }).primaryKey(),
  topic: text("topic").notNull(),
  payload: jsonb("payload").notNull().default({}),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("outbox_undelivered_idx").on(t.deliveredAt, t.topic)]);

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull().default({}),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
