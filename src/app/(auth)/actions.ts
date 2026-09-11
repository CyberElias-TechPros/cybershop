"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { and, eq, isNull, sql } from "drizzle-orm";
import { businessMembers, businesses, roles, userRoles, users } from "@/db/schema";
import { getDb } from "@/db/client";
import { uuidv7, ensureUniqueSlug, slugify, fail, ok, type AnyResult } from "@/lib/util";
import { clearLoginFailures, createSession, destroySession, hashPassword, isLocked, normalize, passwordPolicy, registerFailedLogin, audit, THROTTLE } from "@/core/auth";
import { z } from "zod";

const EMAIL = z.string().trim().toLowerCase().email("Enter an email address like you@business.com");
const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: EMAIL,
  password: z.string().min(8, "Use at least 8 characters").max(128),
  businessName: z.string().trim().min(2, "Enter your business name").max(80),
  city: z.string().trim().max(60).optional(),
  whatsapp: z.string().trim().min(7, "Enter your WhatsApp number"),
});

export async function signupAction(prev: AnyResult | null, form: FormData): Promise<AnyResult | null> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return fail("validation", "Please fix the highlighted fields.", Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
  }
  const d = parsed.data;
  const db = getDb();

  const [existing] = await db.select().from(users).where(sql`lower(${users.email}) = ${d.email}`).limit(1);
  if (existing) {
    return fail("email_taken", "That email already has an account.", { email: "This email is already registered. Try signing in." });
  }

  const [ownerRole] = await db.select().from(roles).where(eq(roles.key, "owner")).limit(1);
  const userId = uuidv7();
  const businessId = uuidv7();
  const passwordHash = await hashPassword(normalize(d.password));

  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id: userId, email: d.email, name: d.name, passwordHash, status: "active" });
    await tx.insert(businesses).values({
      id: businessId, ownerUserId: userId, name: d.businessName,
      slug: ensureUniqueSlug(slugify(d.businessName) || "store", await takenSlugs()),
      city: d.city || null, status: "active", onboardingStep: 1,
    });
    if (ownerRole) {
      await tx.insert(userRoles).values({ userId, roleId: ownerRole.id, businessId });
      await tx.insert(businessMembers).values({ businessId, userId, roleId: ownerRole.id, status: "active", joinedAt: new Date() });
    }
    const { whatsappNumbers } = await import("@/db/schema");
    const { normalizeWhatsapp } = await import("@/core/whatsapp");
    const wa = normalizeWhatsapp(d.whatsapp);
    if (wa.ok) {
      await tx.insert(whatsappNumbers).values({ id: uuidv7(), businessId, e164: wa.e164, label: "Sales", isDefault: true, isActive: true });
    }
    // Phase 1 (your decision): billing is inert, so a new store is active immediately.
    // Phase 2 flips this to pending_payment + a payment intent (BUILD_PLAN 11.2).
  });

  await audit({ actorUserId: userId, action: "vendor.signup", resource: "business", resourceId: businessId, businessId });
  await createSession(userId);
  redirect("/dashboard");
}

export async function loginAction(prev: AnyResult | null, form: FormData): Promise<AnyResult | null> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = normalize(String(form.get("password") ?? ""));
  if (!email || !password) return fail("missing", "Enter your email and password.", { email: email ? "" : "Enter your email", password: password ? "" : "Enter your password" });

  const db = getDb();
  const [user] = await db.select().from(users).where(and(sql`lower(${users.email}) = ${email}`, isNull(users.deletedAt))).limit(1);
  if (!user) return fail("bad_credentials", "We could not find an account with that email and password.");
  if (isLocked(user)) {
    const mins = Math.ceil(((user.lockedUntil?.getTime() ?? 0) - Date.now()) / 60000);
    return fail("locked", `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
  }
  if (user.status === "suspended") return fail("suspended", "This account is suspended. Contact support.");

  const { verifyPassword } = await import("@/core/auth");
  if (!(await verifyPassword(password, user.passwordHash))) {
    const locked = await registerFailedLogin(email);
    return locked
      ? fail("locked", `Too many attempts. Try again in ${Math.ceil(THROTTLE.lockoutMs / 60000)} minutes.`)
      : fail("bad_credentials", "We could not find an account with that email and password.");
  }
  await clearLoginFailures(user.id);
  await createSession(user.id);
  const dest = user.status === "active" ? (await isVendor(user.id) ? "/dashboard" : "/admin") : "/";
  redirect(dest);
}

async function isVendor(userId: string) {
  const db = getDb();
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(businessMembers).where(eq(businessMembers.userId, userId));
  return Number(r?.n ?? 0) > 0;
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

async function takenSlugs() {
  const rows = await getDb().select({ slug: businesses.slug }).from(businesses);
  return new Set(rows.map((r) => r.slug));
}
