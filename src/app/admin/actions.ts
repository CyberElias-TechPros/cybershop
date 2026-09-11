"use server";

/**
 * Admin money + trust actions. The important invariant (BUILD_PLAN 11.2, I3):
 * verifying a payment flips payment + subscription + business + audit + notification
 * inside ONE transaction, and approving twice cannot happen.
 */
import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  auditLogs, businesses, businessTypes, catalogueTypes, fieldDefinitions, notifications,
  payments, plans, subscriptions, whatsappNumbers,
} from "@/db/schema";
import { getDb } from "@/db/client";
import { audit, requirePermission } from "@/core/auth";
import { fail, ok, uuidv7, type AnyResult } from "@/lib/util";
import { normalizeWhatsapp } from "@/core/whatsapp";

export async function reviewPaymentAction(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const decision = String(form.get("decision") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  const admin = await requirePermission(decision === "verified" ? "payments.verify" : "payments.reject");
  if (!["verified", "rejected"].includes(decision)) return;
  if (decision === "rejected" && reason.length < 4) {
    throw new Error("A rejection needs a reason the vendor can act on.");
  }
  const db = getDb();

  await db.transaction(async (tx) => {
    // row lock: two admins clicking Approve at once must not both run the side effects
    const [payment] = await tx.select().from(payments).where(eq(payments.id, id)).limit(1).for("update");
    if (!payment) throw new Error("Payment not found.");
    if (payment.status !== "pending") throw new Error(`Already ${payment.status}.`);

    await tx.update(payments).set({
      status: decision as never, verifiedAt: decision === "verified" ? new Date() : null,
      verifiedBy: admin.userId, rejectionReason: decision === "rejected" ? reason : null,
    }).where(and(eq(payments.id, id), eq(payments.status, "pending")));

    if (decision === "verified") {
      const plan = await tx.select({ id: plans.id }).from(plans).where(eq(plans.code, "business")).limit(1);
      const periodDays = payment.kind === "subscription" ? 30 : 30;
      if (payment.subscriptionId) {
        await tx.update(subscriptions).set({
          status: "active", currentPeriodEnd: new Date(Date.now() + periodDays * 864e5), graceEndsAt: null,
        }).where(eq(subscriptions.id, payment.subscriptionId));
      } else if (plan[0]) {
        await tx.insert(subscriptions).values({
          id: uuidv7(), businessId: payment.businessId, planId: plan[0].id, status: "active",
          currentPeriodEnd: new Date(Date.now() + periodDays * 864e5), activationMode: "manual",
        });
      }
      await tx.update(businesses).set({ status: "active", updatedAt: new Date() })
        .where(and(
          eq(businesses.id, payment.businessId),
          inArray(businesses.status, ["pending_payment", "payment_submitted", "under_review", "expired", "suspended"]),
        ));
    } else {
      await tx.update(businesses).set({ status: "under_review", updatedAt: new Date() }).where(eq(businesses.id, payment.businessId));
    }

    if (payment.userId) {
      await tx.insert(notifications).values({
        id: uuidv7(), businessId: payment.businessId, userId: payment.userId,
        kind: `payment.${decision}`,
        title: decision === "verified" ? "Payment confirmed - your storefront is live" : "Payment could not be verified",
        body: decision === "verified"
          ? "Thanks - we matched your transfer. Everything you had drafted is published now."
          : `Reason: ${reason}. Upload the correct receipt or pay with card to activate again.`,
        data: { paymentId: id },
      });
    }

    await tx.insert(auditLogs).values({
      actorUserId: admin.userId, actorKind: "user", action: `payment.${decision}`, resource: "payment",
      resourceId: id, businessId: payment.businessId,
      before: { status: payment.status }, after: { status: decision, reason: reason || null, amount: payment.amountMinor },
    });
  });

  revalidatePath("/admin/payments");
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

export async function reviewBusinessAction(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const next = String(form.get("status") ?? "");
  const allowed: Record<string, string> = { active: "vendors.update", suspended: "vendors.suspend", rejected: "vendors.update" };
  const perm = allowed[next];
  if (!perm) return;
  const admin = await requirePermission(perm as never);
  const db = getDb();
  const [before] = await db.select({ status: businesses.status, name: businesses.name }).from(businesses).where(eq(businesses.id, id)).limit(1);
  if (!before) return;
  await db.update(businesses).set({ status: next as never, updatedAt: new Date() }).where(eq(businesses.id, id));
  if (next === "active") {
    await db.update(subscriptions).set({ status: "active", currentPeriodEnd: new Date(Date.now() + 30 * 864e5) })
      .where(eq(subscriptions.businessId, id));
  }
  await audit({
    actorUserId: admin.userId, action: `business.${next}`, resource: "business", resourceId: id, businessId: id,
    before, after: { status: next },
  });
  revalidatePath("/admin/businesses");
  revalidatePath("/admin");
}

export async function verifyBusinessAction(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const admin = await requirePermission("vendors.verify");
  const db = getDb();
  const [b] = await db.select({ isVerified: businesses.isVerified }).from(businesses).where(eq(businesses.id, id)).limit(1);
  if (!b) return;
  await db.update(businesses).set({ isVerified: !b.isVerified, verifiedAt: b.isVerified ? null : new Date(), verifiedBy: b.isVerified ? null : admin.userId })
    .where(eq(businesses.id, id));
  await audit({ actorUserId: admin.userId, action: b.isVerified ? "business.unverify" : "business.verify", resource: "business", resourceId: id, businessId: id, before: b });
  revalidatePath("/admin/businesses");
}

export async function addBusinessTypeAction(prev: AnyResult | null, form: FormData): Promise<AnyResult | null> {
  const admin = await requirePermission("categories.manage");
  const name = String(form.get("name") ?? "").trim();
  const key = String(form.get("key") ?? "").trim().toLowerCase().replaceAll(" ", "_");
  if (name.length < 2 || !/^[a-z0-9_]{2,32}$/.test(key)) {
    return fail("validation", "Pick a short name and a snake_case key like `auto_repair`.", { key: "Use letters, numbers and underscores" });
  }
  const db = getDb();
  const [dup] = await db.select({ id: businessTypes.id }).from(businessTypes).where(eq(businessTypes.key, key)).limit(1);
  if (dup) return fail("dup", "That key already exists.", { key: "Another business type uses this key" });
  const [row] = await db.insert(businessTypes).values({ id: uuidv7(), key, name, isActive: true, sortOrder: 99 }).returning({ id: businessTypes.id });
  await audit({ actorUserId: admin.userId, action: "business_type.create", resource: "business_type", resourceId: row!.id, after: { key, name } });
  revalidatePath("/admin/schema");
  return ok({ id: row!.id });
}

export async function addFieldAction(prev: AnyResult | null, form: FormData): Promise<AnyResult | null> {
  const admin = await requirePermission("schema.manage");
  const typeId = String(form.get("catalogueTypeId") ?? "");
  const key = String(form.get("key") ?? "").trim().toLowerCase();
  const label = String(form.get("label") ?? "").trim();
  const type = String(form.get("type") ?? "text");
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(key)) return fail("key", "Field keys start with a letter and use lowercase, numbers or underscores.", { key: "Invalid key" });
  if (label.length < 2) return fail("label", "Give the field a label vendors will see.", { label: "Required" });

  const db = getDb();
  const [dup] = await db.select({ id: fieldDefinitions.id }).from(fieldDefinitions)
    .where(and(eq(fieldDefinitions.catalogueTypeId, typeId), eq(fieldDefinitions.key, key))).limit(1);
  if (dup) return fail("dup", "That field already exists on this catalogue type.", { key: "Already exists" });

  const [row] = await db.insert(fieldDefinitions).values({
    id: uuidv7(), catalogueTypeId: typeId, key, label, type,
    isRequired: form.get("isRequired") === "on",
    isPublic: true,
    isFilterable: form.get("isFilterable") === "on",
    isSearchable: form.get("isSearchable") === "on",
    placeholder: String(form.get("placeholder") ?? "").slice(0, 80) || null,
    helpText: String(form.get("helpText") ?? "").slice(0, 200) || null,
    sortOrder: Number(form.get("sortOrder") ?? 99),
    config: {}, validation: {},
  }).returning({ id: fieldDefinitions.id });

  const options = String(form.get("options") ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < options.length; i++) {
    const [value, labelText] = options[i]!.includes("|") ? options[i]!.split("|") : [options[i], options[i]];
    const { fieldOptions } = await import("@/db/schema");
    await db.insert(fieldOptions).values({ id: uuidv7(), fieldDefinitionId: row!.id, value: value!.trim(), label: (labelText ?? value)!.trim(), sortOrder: i });
  }

  // schema_version bump is the signal for "this type's shape changed" (BUILD_PLAN 6.3)
  await db.update(catalogueTypes).set({ schemaVersion: sql`${catalogueTypes.schemaVersion} + 1` }).where(eq(catalogueTypes.id, typeId));

  await audit({ actorUserId: admin.userId, action: "field.create", resource: "field_definition", resourceId: row!.id, after: { key, label, type, options: options.length } });
  revalidatePath("/admin/schema");
  return ok({ id: row!.id });
}

export async function setNumberActiveAction(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const admin = await requirePermission("vendors.update");
  const db = getDb();
  const [n] = await db.select().from(whatsappNumbers).where(eq(whatsappNumbers.id, id)).limit(1);
  if (!n) return;
  const norm = normalizeWhatsapp(String(form.get("e164") ?? n.e164));
  await db.update(whatsappNumbers).set({ isActive: !n.isActive, e164: norm.ok ? norm.e164 : n.e164 })
    .where(eq(whatsappNumbers.id, id));
  await audit({ actorUserId: admin.userId, action: "whatsapp.toggle", resource: "whatsapp_number", resourceId: id, businessId: n.businessId, before: { active: n.isActive } });
  revalidatePath("/admin/businesses");
}
