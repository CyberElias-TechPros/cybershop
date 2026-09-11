/**
 * Demo seed (BUILD_PLAN 27). Idempotent: running it twice leaves one dataset.
 * It is also the fixture for e2e, so the numbers below are load-bearing for the
 * onboarding + storefront + WhatsApp-click flow tests.
 */
import { and, eq, sql } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as S from "./schema";
import { DEFAULT_TEMPLATES } from "@/core/whatsapp";
import { uuidv7 } from "@/lib/util";
import { hashPassword } from "@/core/auth";
import { PERMISSIONS, ROLE_GRANTS } from "@/core/auth";

type DB = PgliteDatabase<typeof S>;
const DEMO = {
  adminEmail: "admin@cybershop.test",
  adminPassword: "Cybershop#2026",
  vendorEmail: "hello@amarafashion.test",
  vendorPassword: "Cybershop#2026",
  tutorEmail: " admissions@cyberacademy.test".trim(),
  tutorPassword: "Cybershop#2026",
};
const now = () => new Date();
const plus = (days: number) => new Date(Date.now() + days * 864e5);

export async function seed(db: DB) {
  const [existing] = await db.select({ n: sql<number>`count(*)::int` }).from(S.businessTypes);
  if (Number(existing?.n ?? 0) > 0) { console.log("seed skipped (already seeded)"); return; }

  /* ---------- roles + permissions ---------- */
  const permIds = new Map<string, string>();
  for (const key of PERMISSIONS) {
    const [row] = await db.insert(S.permissions).values({ id: cryptoId(), key }).onConflictDoNothing().returning();
    permIds.set(key, row?.id ?? (await db.select().from(S.permissions).where(eq(S.permissions.key, key)).limit(1))[0]!.id);
  }
  const roleIds = new Map<string, string>();
  for (const [key, grants] of Object.entries(ROLE_GRANTS)) {
    const isPlatform = ["super_admin", "administrator", "finance_admin", "content_admin", "support_admin", "moderator", "analyst"].includes(key);
    const [row] = await db.insert(S.roles).values({
      id: cryptoId(), key, isPlatform,
      description: isPlatform ? `Platform staff role (${grants.length} permissions)` : `Vendor team role (${grants.length} permissions)`,
    }).returning();
    roleIds.set(key, row!.id);
    for (const g of grants) {
      const pid = permIds.get(g);
      if (pid) await db.insert(S.rolePermissions).values({ roleId: row!.id, permissionId: pid }).onConflictDoNothing();
    }
  }

  /* ---------- plans (billing is inert in phase 1: quotas enforced, no payment UI) ---------- */
  type PlanSeed = {
    code: string; name: string; blurb: string; priceMinor: number; requiresActivationPayment: boolean; sortOrder: number;
    quotas: Record<string, number | null>;
  };
  const planIds: Record<string, string> = {};
  const planSeeds: PlanSeed[] = [
    { code: "free", name: "Free storefront", blurb: "Test the platform with up to 10 items.", priceMinor: 0, requiresActivationPayment: false, sortOrder: 1,
      quotas: { catalogue_items: 10, whatsapp_numbers: 1, media_bytes: 500 * 1024 * 1024, categories: 2, offers: 0, staff_seats: 1, featured_slots: 0, locations: 1, custom_fields: 0 } },
    { code: "starter", name: "Starter", blurb: "For a real shop getting daily enquiries.", priceMinor: 500_000, requiresActivationPayment: true, sortOrder: 2,
      quotas: { catalogue_items: 100, whatsapp_numbers: 2, media_bytes: 5 * 1024 ** 3, categories: 5, offers: 5, staff_seats: 2, featured_slots: 0, locations: 2, custom_fields: 5 } },
    { code: "business", name: "Business", blurb: "Unlimited items, 5 WhatsApp numbers, video.", priceMinor: 2_500_000, requiresActivationPayment: true, sortOrder: 3,
      quotas: { catalogue_items: null, whatsapp_numbers: 5, media_bytes: 20 * 1024 ** 3, categories: 20, offers: 50, staff_seats: 5, featured_slots: 6, locations: 10, custom_fields: 25 } },
  ];
  for (const p of planSeeds) {
    const [row] = await db.insert(S.plans).values({
      id: cryptoId(), code: p.code, name: p.name, priceMinor: p.priceMinor, interval: "monthly",
      trialDays: 0, isPublic: true, requiresActivationPayment: p.requiresActivationPayment,
      sortOrder: p.sortOrder, description: p.blurb,
    }).returning();
    planIds[p.code] = row!.id;
    for (const [resource, limit] of Object.entries(p.quotas)) {
      await db.insert(S.planQuotas).values({
        planId: row!.id, resource: resource as never,
        quotaLimit: (limit ?? null) as number | null, softLimitPct: 80,
      }).onConflictDoNothing();
    }
    for (const [featureKey, value] of Object.entries(
      p.code === "free"
        ? { video: { on: false }, analytics: { on: true, retentionDays: 30 }, storefrontBuilder: { level: "basic" }, customDomain: { on: false }, api: { on: false }, bulkImport: { on: false } }
        : p.code === "starter"
          ? { video: { on: false }, analytics: { on: true, retentionDays: 90 }, storefrontBuilder: { level: "sections" }, customDomain: { on: false }, api: { on: false }, bulkImport: { on: true } }
          : { video: { on: true, maxBytes: 25_000_000, maxSeconds: 60 }, analytics: { on: true, retentionDays: 365 }, storefrontBuilder: { level: "advanced" }, customDomain: { on: true }, api: { on: true }, bulkImport: { on: true } },
    )) {
      await db.insert(S.planFeatures).values({ planId: row!.id, featureKey, value }).onConflictDoNothing();
    }
  }

  /* ---------- users ---------- */
  const [admin] = await db.insert(S.users).values({
    id: cryptoId(), email: DEMO.adminEmail, name: "Platform Admin",
    passwordHash: await hashPassword(DEMO.adminPassword), status: "active", emailVerifiedAt: now(),
  }).returning();
  await db.insert(S.userRoles).values({ userId: admin!.id, roleId: roleIds.get("super_admin")! });

  const [vendor] = await db.insert(S.users).values({
    id: cryptoId(), email: DEMO.vendorEmail, name: "Amara Okafor", phone: "+2348031234567",
    passwordHash: await hashPassword(DEMO.vendorPassword), status: "active", emailVerifiedAt: now(),
  }).returning();
  const [tutor] = await db.insert(S.users).values({
    id: cryptoId(), email: DEMO.tutorEmail, name: "Emeka Tech",
    passwordHash: await hashPassword(DEMO.tutorPassword), status: "active",
  }).returning();

  /* ---------- verticals: business types -> catalogue types -> fields ---------- */
  const bt = new Map<string, { id: string }>();
  for (const [key, name, icon, sort] of [
    ["retail", "Retail shop", "bag", 1], ["education", "School / academy", "cap", 2],
    ["beauty", "Beauty & salon", "sparkle", 3], ["realestate", "Real estate", "building", 4],
    ["food", "Food & kitchen", "plate", 5], ["professional", "Professional services", "briefcase", 6],
  ] as const) {
    const [row] = await db.insert(S.businessTypes).values({ id: cryptoId(), key, name, icon, sortOrder: sort, isActive: true }).returning();
    bt.set(key, { id: row!.id });
  }

  const ct = new Map<string, { id: string }>();
  const types: Array<[string, string, string, string, string, string, string]> = [
    ["product", "Product", "Product", "Products", "Order on WhatsApp", "Product", "retail"],
    ["course", "Course", "Course", "Courses", "Register on WhatsApp", "Course", "education"],
    ["service", "Service", "Service", "Services", "Book on WhatsApp", "Service", "professional"],
    ["appointment", "Appointment", "Appointment", "Appointments", "Book on WhatsApp", "Service", "beauty"],
    ["property", "Property", "Listing", "Listings", "Request inspection", "RealEstateListing", "realestate"],
    ["dish", "Menu item", "Dish", "Menu", "Order on WhatsApp", "Product", "food"],
  ];
  for (const [key, name, noun, plural, verb, schemaKind, btKey] of types) {
    const [row] = await db.insert(S.catalogueTypes).values({
      id: cryptoId(), key, name, itemNoun: noun, itemNounPlural: plural, ctaVerb: verb,
      schemaKind, isActive: true, sortOrder: ct.size + 1,
      mediaRules: key === "product" || key === "property" ? { images: { max: 12, required: 1 }, video: { allowed: false } } : { images: { max: 6 }, video: { allowed: false } },
    }).returning();
    ct.set(key, { id: row!.id });
    if (btKey) await db.insert(S.businessTypeCatalogueTypes).values({
      businessTypeId: bt.get(btKey)!.id, catalogueTypeId: row!.id,
    }).onConflictDoNothing();
  }

  type F = [key: string, label: string, type: string, opts?: { req?: boolean; filt?: boolean; search?: boolean; maps?: string; cfg?: object; val?: object; options?: [string, string][]; help?: string }];
  const fieldsFor: Record<string, F[]> = {
    product: [
      ["brand", "Brand", "text", { filt: true, search: true }],
      ["condition", "Condition", "select", { filt: true, options: [["new", "New"], ["used_clean", "Used - clean"], ["refurbished", "Refurbished"]] }],
      ["colour", "Colour", "text", { filt: true }],
      ["size", "Size", "select", { filt: true, options: [["s", "S"], ["m", "M"], ["l", "L"], ["xl", "XL"], ["xxl", "XXL"]] }],
      ["material", "Material", "text"],
      ["warranty", "Warranty", "text", { help: "e.g. \"6 months store warranty\"" }],
      ["weight_kg", "Weight (kg)", "number", { val: { min: 0, max: 500 } }],
      ["in_box", "Comes in original box", "boolean"],
    ],
    course: [
      ["duration_weeks", "Duration (weeks)", "duration", { filt: true, cfg: { unit: "weeks" } }],
      ["mode", "Delivery mode", "select", { req: true, filt: true, options: [["online", "Online"], ["onsite", "On-site"], ["hybrid", "Hybrid"]] }],
      ["skill_level", "Skill level", "select", { filt: true, options: [["beginner", "Beginner"], ["intermediate", "Intermediate"], ["advanced", "Advanced"]] }],
      ["start_date", "Next start date", "date", { filt: true }],
      ["certification", "Certification", "text", { search: true }],
      ["instructor", "Instructor", "text", { search: true }],
      ["seats_left", "Seats left", "number", { val: { min: 0, max: 5000 }, filt: true }],
      ["curriculum", "Curriculum (PDF)", "file", { cfg: { max: 3 }, val: { maxBytes: 10_000_000 } }],
      ["requirements", "Requirements", "textarea"],
    ],
    service: [
      ["consultant", "Consultant", "text", { search: true }],
      ["session_minutes", "Session length (minutes)", "number", { val: { min: 5, max: 600 }, filt: true }],
      ["delivery", "Delivery method", "select", { filt: true, options: [["in_person", "In person"], ["video", "Video call"], ["async", "Async (chat/email)"]] }],
      ["availability", "Availability", "textarea"],
      ["includes", "What is included", "multiselect", { options: [["audit", "Audit"], ["plan", "Written plan"], ["sessions", "Follow-up sessions"], ["support", "Chat support"], ["report", "Report"]] }],
    ],
    appointment: [
      ["stylist", "Stylist", "text", { search: true }],
      ["duration_minutes", "Time needed", "number", { val: { min: 5, max: 600 }, filt: true }],
      ["deposit_required", "Deposit required", "boolean"],
      ["prep", "How to prepare", "textarea"],
    ],
    property: [
      ["property_type", "Property type", "select", { req: true, filt: true, options: [["duplex", "Duplex"], ["flat", "Flat / apartment"], ["land", "Land"], ["commercial", "Commercial"], ["shortlet", "Shortlet"]] }],
      ["purpose", "Purpose", "select", { req: true, filt: true, options: [["sale", "For sale"], ["rent", "For rent"], ["lease", "Long lease"]] }],
      ["bedrooms", "Bedrooms", "number", { val: { min: 0, max: 50 }, filt: true }],
      ["bathrooms", "Bathrooms", "number", { val: { min: 0, max: 50 }, filt: true }],
      ["address_area", "Area / estate", "text", { req: true, filt: true, search: true }],
      ["features", "Features", "multiselect", { options: [["parking", "Parking"], ["borehole", "Borehole"], ["generator", "Generator"], ["fenced", "Fully fenced"], ["servicing", "Service charge"], ["cq", "C of O"]] }],
      ["title_docs", "Title documents", "text"],
      ["location", "Map location", "location"],
    ],
    dish: [
      ["spice_level", "Spice level", "select", { options: [["mild", "Mild"], ["hot", "Hot"], ["extra_hot", "Extra hot"]] }],
      ["serves", "Serves", "number", { val: { min: 1, max: 50 }, filt: true }],
      ["allergens", "Allergens", "text"],
      ["available_now", "Available today", "boolean", { filt: true }],
    ],
  };

  const defIds = new Map<string, string>();   // `${type}.${key}` -> id
  for (const [typeKey, fields] of Object.entries(fieldsFor)) {
    const typeId = ct.get(typeKey)!.id;
    let sort = 0;
    for (const [key, label, type, o = {}] of fields) {
      const [row] = await db.insert(S.fieldDefinitions).values({
        id: cryptoId(), catalogueTypeId: typeId, key, label, type,
        isRequired: !!o.req, isPublic: true, isFilterable: !!o.filt, isSearchable: !!o.search,
        mapsTo: o.maps ?? null, helpText: o.help ?? null,
        config: (o.cfg ?? {}) as never, validation: (o.val ?? {}) as never,
        sortOrder: sort++,
      }).returning();
      defIds.set(`${typeKey}.${key}`, row!.id);
      for (let i = 0; i < (o.options ?? []).length; i++) {
        const [value, lab] = o.options![i]!;
        await db.insert(S.fieldOptions).values({ id: cryptoId(), fieldDefinitionId: row!.id, value, label: lab, sortOrder: i });
      }
    }
  }

  /* ---------- platform WhatsApp templates (plan.md 62) ---------- */
  for (const [kind, body] of Object.entries(DEFAULT_TEMPLATES)) {
    await db.insert(S.waTemplates).values({
      id: cryptoId(), scope: "platform", kind, name: kind.replaceAll("_", " "), bodyText: body,
      variables: [], isActive: true, locale: "en",
    });
  }

  /* ---------- categories ---------- */
  const catIds = new Map<string, string>();
  for (const [slug, name, btKey, allowed] of [
    ["dresses", "Dresses", "retail", ["product"]], ["shoes", "Shoes", "retail", ["product"]],
    ["bags", "Bags", "retail", ["product"]],
    ["web-development", "Web development", "education", ["course"]],
    ["data-analysis", "Data analysis", "education", ["course"]],
    ["hair", "Hair", "beauty", ["appointment"]],
  ] as const) {
    const [row] = await db.insert(S.categories).values({
      id: cryptoId(), slug, name, businessTypeId: bt.get(btKey)!.id,
      allowedCatalogueTypes: allowed as unknown as never, sortOrder: catIds.size,
    }).returning();
    catIds.set(slug, row!.id);
  }

  /* ---------- businesses ---------- */
  async function makeBusiness(opts: {
    ownerId: string; slug: string; name: string; tagline: string; description: string;
    city: string; btKey: string; phone: string; wa: Array<[label: string, e164: string, isDefault: boolean]>;
  }) {
    const [biz] = await db.insert(S.businesses).values({
      id: cryptoId(), ownerUserId: opts.ownerId, slug: opts.slug, name: opts.name, tagline: opts.tagline,
      description: opts.description, city: opts.city, state: "Lagos", country: "NG", phone: opts.phone,
      status: "active", visibility: "public", currency: "NGN", isVerified: true, verifiedAt: now(),
      onboardingStep: 6,
      openingHours: { mon_fri: "9am - 6pm", sat: "10am - 4pm", sun: "Closed" },
      socials: { instagram: `@${opts.slug}`, x: `@${opts.slug}` },
      storefront: {
        style: opts.btKey === "retail" ? "editorial" : "modern",
        accent: opts.btKey === "retail" ? "#7c1d3f" : "#0b4f6c",
        sections: ["hero", "featured", "catalogue", "about", "gallery", "faq", "contact"],
        heroMode: opts.btKey === "retail" ? "image" : "gradient",
      },
      faqs: [{ q: "How do I pay?", a: "We agree on WhatsApp and you pay on delivery or by transfer to our account." }],
      policies: { delivery: "Nationwide dispatch within 48 hours. Lagos same-day on request." },
    }).returning();

    await db.insert(S.businessMembers).values({ businessId: biz!.id, userId: opts.ownerId, roleId: roleIds.get("owner")!, status: "active", joinedAt: now() });
    await db.insert(S.userRoles).values({ userId: opts.ownerId, roleId: roleIds.get("owner")!, businessId: biz!.id });
    await db.insert(S.subscriptions).values({
      id: cryptoId(), businessId: biz!.id, planId: planIds.business ?? planIds.free!,
      status: "active", currentPeriodEnd: plus(300), activationMode: "manual",
    });

    const numIds = new Map<string, string>();
    for (const [label, e164, isDefault] of opts.wa) {
      const [n] = await db.insert(S.whatsappNumbers).values({
        id: cryptoId(), businessId: biz!.id, label, e164, isDefault, isActive: true, source: "plan", verifiedAt: now(),
      }).returning();
      numIds.set(label, n!.id);
    }
    return { biz: biz!, numIds };
  }

  const fashion = await makeBusiness({
    ownerId: vendor!.id, slug: "amara-fashion", name: "Amara Fashion", city: "Ikeja",
    tagline: "Ankara & ready-to-wear, made to order", phone: "+2348031234567", btKey: "retail",
    description: "We cut and sew contemporary African fashion. Every piece is made to order in our Ikeja studio, and you can ask any question directly on WhatsApp before you commit.",
    wa: [["Sales", "+2348031234567", true], ["Studio pickup", "+2348035550011", false]],
  });
  const academy = await makeBusiness({
    ownerId: tutor!.id, slug: "cyber-academy", name: "Cyber Academy", city: "Yaba",
    tagline: "Practical tech classes with real projects", phone: "+2348090001122", btKey: "education",
    description: "Small-cohort, project-first technology classes. Admissions are handled on WhatsApp - send us the course you are interested in and we will tell you honestly whether it fits you.",
    wa: [["Admissions", "+2348090001122", true], ["Support", "+2348090001123", false]],
  });

  /* routing rule: academy sends courses to Admissions (plan.md 63) */
  await db.insert(S.whatsappRouting).values({
    id: cryptoId(), businessId: academy.biz.id, matchType: "catalogue_type",
    matchRef: ct.get("course")!.id, whatsappNumberId: academy.numIds.get("Admissions")!, priority: 10,
  });

  /* ---------- items ---------- */
  async function addItem(b: { biz: typeof fashion.biz; numIds: Map<string, string> }, typeKey: string, v: {
    slug: string; name: string; price: string; summary: string; desc: string; image: string;
    fields?: Record<string, unknown>; categorySlug?: string; featured?: boolean; sku?: string; stockQty?: number; outOfStock?: boolean; waLabel?: string;
  }) {
    const [item] = await db.insert(S.catalogueItems).values({
      id: cryptoId(), businessId: b.biz.id, catalogueTypeId: ct.get(typeKey)!.id,
      categoryId: v.categorySlug ? catIds.get(v.categorySlug) ?? null : null,
      slug: v.slug, name: v.name, summary: v.summary,
      descriptionHtml: `<p>${v.desc}</p>`, descriptionText: v.desc,
      status: "published", publishedAt: now(), price: v.price, priceType: "fixed", currency: "NGN",
      isFeatured: !!v.featured, sku: v.sku ?? null, stockQty: v.stockQty ?? null, isOutOfStock: !!v.outOfStock,
      whatsappNumberId: v.waLabel ? b.numIds.get(v.waLabel) ?? null : null,
      search: `${v.name} ${v.summary} ${v.desc}`,
      seo: { title: `${v.name} - ${b.biz.name}`, description: v.summary.slice(0, 155) },
    }).returning();

    const [mediaRow] = await db.insert(S.media).values({
      id: cryptoId(), businessId: b.biz.id, entityKind: "item_image", entityRef: item!.id,
      storageKey: `demo/${v.image}`, publicUrl: `/demo/${v.image}`, originalName: v.image,
      mimeType: "image/jpeg", extension: "jpg", byteSize: 240_000, width: 1200, height: 900,
      checksum: `demo-${v.slug}`, altText: v.name, role: "hero", visibility: "public",
      status: "attached", quotaCharged: false, attachedAt: now(),
    }).returning();
    await db.insert(S.itemMedia).values({ itemId: item!.id, mediaId: mediaRow!.id, role: "hero", sortorder: 0 });

    for (const [key, value] of Object.entries(v.fields ?? {})) {
      const defId = defIds.get(`${typeKey}.${key}`);
      if (!defId) throw new Error(`seed: unknown field ${typeKey}.${key}`);
      await db.insert(S.itemFieldValues).values({
        itemId: item!.id, fieldDefinitionId: defId, value: value as never,
        valueText: typeof value === "string" ? value : Array.isArray(value) ? value.join(", ") : null,
        valueNum: typeof value === "number" ? String(value) : null,
        valueJson: typeof value === "string" || Array.isArray(value) || typeof value === "boolean" ? value : null,
      });
    }
    return item!;
  }

  const laptop = await addItem(fashion, "product", {
    slug: "ankara-maxi-dress", name: "Ankara Maxi Dress", price: "85000", sku: "AMD-001", stockQty: 6,
    summary: "Hand-cut maxi dress in premium Ankara print, lined throughout.",
    desc: "Cut and sewn in our Ikeja studio from 100% cotton Ankara print. Fully lined, invisible side zip, deep pockets, and a hem you can ask us to shorten before we sew it.",
    image: "dress.jpg", featured: true, categorySlug: "dresses",
    fields: { brand: "Amara Studio", condition: "new", colour: "Rust palm print", size: "l", material: "100% cotton Ankara", warranty: "Free fitting adjustment within 14 days", weight_kg: 0.6, in_box: false },
  });
  await addItem(fashion, "product", {
    slug: "adire-two-piece", name: "Adire Two Piece Set", price: "62000",
    summary: "Hand-dyed Adire top and trousers, relaxed fit.",
    desc: "Resist-dyed by our partner co-operative in Abeokuta, then cut here. No two sets are identical - we will send you photos of the exact fabric before sewing.",
    image: "adire.jpg", categorySlug: "dresses", stockQty: 3,
    fields: { brand: "Amara Studio", condition: "new", colour: "Indigo", size: "m", material: "Cotton poplin", in_box: true },
  });
  await addItem(fashion, "product", {
    slug: "leather-tote", name: "Structured Leather Tote", price: "145000",
    summary: "Full-grain leather tote that fits a 15-inch laptop.",
    desc: "Made by a family workshop in Kano from full-grain leather, with a cotton lining, laptop sleeve and magnetic closure.",
    image: "tote.jpg", outOfStock: true, categorySlug: "bags",
    fields: { brand: "Kano Leather Co", condition: "new", colour: "Cognac", material: "Full-grain leather", weight_kg: 1.1 },
  });
  await addItem(fashion, "product", {
    slug: "gele-head-wrap", name: "Stiff Gele Head Wrap", price: "18000",
    summary: "Pre-tied style, holds shape all day.",
    desc: "A hard-gele in a warm gold tone that photographs beautifully and does not collapse after two hours.",
    image: "gele.jpg", categorySlug: "dresses",
    fields: { brand: "Amara Studio", condition: "new", colour: "Gold", size: "xl" },
  });

  await addItem(academy, "course", {
    slug: "full-stack-web-development", name: "Full-Stack Web Development", price: "450000",
    summary: "16 weeks, project-based, Monday and Thursday evenings.",
    desc: "You build five real things: a marketing site, a data-driven dashboard, a Next.js app with a database, an authenticated API, and a capstone you choose. Weekly code review, and you keep the repo history as proof of work.",
    image: "classroom.jpg", featured: true, categorySlug: "web-development",
    fields: {
      duration_weeks: 16, mode: "hybrid", skill_level: "beginner", start_date: "2026-10-05",
      certification: "Cybershop Certificate of Completion", instructor: "Emeka + 2 guest tutors",
      seats_left: 7, requirements: "A laptop, 10 hours a week, and comfort with the command line is optional.",
    },
  });
  await addItem(academy, "course", {
    slug: "data-analysis-bootcamp", name: "Data Analysis Bootcamp", price: "280000",
    summary: "10 weeks: Excel, SQL, Python, and a portfolio of dashboards.",
    desc: "Built around messy Nigerian datasets, not clean toy data. You leave with four published dashboards and a written methodology.",
    image: "analytics.jpg", categorySlug: "data-analysis",
    fields: { duration_weeks: 10, mode: "online", skill_level: "intermediate", start_date: "2026-11-02", certification: "Certificate + portfolio review", instructor: "Dr. Bisi Ade", seats_left: 12 },
  });
  await addItem(academy, "service", {
    slug: "code-review-session", name: "1:1 Code Review Session", price: "25000",
    summary: "90 minutes on your actual project, recorded.",
    desc: "Bring a repo or a Figma file. We review structure, performance and accessibility, and leave you a prioritised punch list.",
    image: "review.jpg",
    fields: { consultant: "Emeka", session_minutes: 90, delivery: "video", includes: ["audit", "report"], availability: "Evenings and Saturday mornings" },
  });

  /* variant on the hero product (plan.md 29) */
  await db.insert(S.variants).values([
    { id: cryptoId(), itemId: laptop.id, name: "Rust / Size M", price: "85000", stockQty: 2, options: { colour: "Rust palm print", size: "m" } },
    { id: cryptoId(), itemId: laptop.id, name: "Rust / Size L", price: "85000", stockQty: 3, options: { colour: "Rust palm print", size: "l" } },
    { id: cryptoId(), itemId: laptop.id, name: "Rust / Size XL", price: "90000", stockQty: 1, options: { colour: "Rust palm print", size: "xl" } },
  ]);

  /* an offer (plan.md 28) - drives the {{offer_line}} variable */
  await db.insert(S.offers).values({
    id: cryptoId(), businessId: fashion.biz.id, itemId: laptop.id, kind: "limited_time",
    title: "Early-cut price before October", percentOff: "10", isActive: true,
    startsAt: new Date(Date.now() - 864e5), endsAt: plus(21),
    terms: "Applies to orders confirmed on WhatsApp before 30 September.",
  });

  /* a lead, so the dashboard has a story to tell */
  const [link] = await db.insert(S.waLinks).values({
    id: cryptoId(), code: "demo0001", businessId: fashion.biz.id, itemId: laptop.id,
    whatsappNumberId: fashion.numIds.get("Sales")!, messageSnapshot:
      "Hello Amara Fashion,\n\nI would like to order this.\n\nItem: Ankara Maxi Dress\nPrice: \u20a685,000\nQuantity: 1\nReference: /business/amara-fashion/ankara-maxi-dress\n\nPlease confirm availability.",
    targetUrl: "https://wa.me/2348031234567?text=demo", expiresAt: plus(30), hitCount: 1,
  }).returning();
  const [inq] = await db.insert(S.inquiries).values({
    id: cryptoId(), businessId: fashion.biz.id, itemId: laptop.id, waLinkId: link!.id,
    whatsappNumberId: fashion.numIds.get("Sales")!, visitorId: "demo-visitor",
    contactName: "Tolu", contactPhone: "+2348112223344",
    message: "Hello Amara Fashion,\n\nI would like to order this.\n\nItem: Ankara Maxi Dress\nPrice: 85000\nQuantity: 1",
    status: "interested", amountEstimated: "85000", source: "item_page",
  }).returning();
  await db.insert(S.inquiryEvents).values([
    { inquiryId: inq!.id, kind: "cta_click", meta: { device: "mobile", country: "NG" } },
    { inquiryId: inq!.id, kind: "app_opened", meta: { ua: "WhatsApp/2.24" } },
  ]);

  /* an inert pending payment so the admin queue has a real row to act on (plan.md 17) */
  const [proof] = await db.insert(S.media).values({
    id: cryptoId(), businessId: fashion.biz.id, entityKind: "payment_proof",
    storageKey: `private/vendors/${fashion.biz.id}/payment-proofs/receipt.png`,
    publicUrl: null, originalName: "receipt.png", mimeType: "image/png", extension: "png",
    byteSize: 180_000, width: 900, height: 1400, checksum: "demo-proof", visibility: "private",
    status: "attached", quotaCharged: false, attachedAt: now(),
  }).returning();
  await db.insert(S.payments).values({
    id: cryptoId(), businessId: fashion.biz.id, userId: vendor!.id, kind: "subscription",
    amountMinor: 250_000, currency: "NGN", method: "bank_transfer", reference: "CS-AMAR-0001",
    status: "pending", proofMediaId: proof!.id, payerNote: "Transferred at 18:42, GTBank -> Zenith",
  });

  await db.insert(S.platformSettings).values([
    { key: "grace", value: { days: 7, noticeDays: [7, 3, 1] } },
    { key: "uploads", value: { maxImageBytes: 8_000_000, maxVideoBytes: 25_000_000, maxImagesPerItem: 12, allowedMime: ["image/jpeg", "image/png", "image/webp", "image/gif"] } },
    { key: "home", value: { headline: "Find a business. Talk to them on WhatsApp.", sub: "Catalogues for shops, schools, salons and services - with no checkout to fight." } },
    { key: "verification", value: { allowed: true, label: "Verified business" } },
  ]).onConflictDoNothing();

  console.log("seed complete:", {
    admin: DEMO.adminEmail, adminPassword: DEMO.adminPassword,
    vendor: DEMO.vendorEmail, vendorPassword: DEMO.vendorPassword,
    stores: ["amara-fashion", "cyber-academy"],
  });
}

/** real v7 ids so the seeded rows are indistinguishable from production ones */
const cryptoId = () => uuidv7();
