/**
 * AuthN / AuthZ / audit — BUILD_PLAN.md §10.
 * scrypt from node:crypto so there is no native module to fail to build on a serverless
 * target; sessions are opaque 256-bit tokens stored hashed.
 */
import { randomBytes, scrypt as _scrypt, timingSafeEqual as tse } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { and, eq, gt, sql } from "drizzle-orm";
import {
  auditLogs, businesses, businessMembers, permissions as permissionTable, rolePermissions,
  roles as roleTable, sessions, userRoles, users,
} from "@/db/schema";
import { getDb } from "@/db/client";
import { env } from "@/lib/env";
import { sha256 } from "@/lib/util";

const scrypt = promisify(_scrypt) as (p: string | Buffer, s: string | Buffer, k: number, o?: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

/* ------------------------------ passwords ------------------------------ */
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const dk = await scrypt(normalize(password), salt, 64, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${dk.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hashB64, "base64");
  const dk = await scrypt(normalize(password), Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: Number(N) * Number(r) * 2 + 1024 * 1024,
  });
  return dk.length === expected.length && tse(dk, expected);
}

/** NFKC so look-alike unicode does not change a password's meaning; 128 char cap DoS-guards scrypt. */
export const normalize = (pw: string) => pw.normalize("NFKC").slice(0, 128);
export const passwordPolicy = (pw: string) =>
  pw.length >= 8 ? null : "Use at least 8 characters.";

/* ------------------------------ sessions ------------------------------ */
export const SESSION_COOKIE = "cyber_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  userId: string;
  email: string;
  name: string;
  platformRoles: string[];
  memberships: Array<{ businessId: string; roleKey: string; slug: string; name: string; status: string }>;
};

export async function createSession(userId: string, req?: Request) {
  const token = randomBytes(32).toString("base64url");
  const db = getDb();
  await db.insert(sessions).values({
    tokenHash: sha256(token),
    userId,
    ip: req ? (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null) : null,
    userAgent: req ? (req.headers.get("user-agent")?.slice(0, 400) ?? null) : null,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5),
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: env.isProd, path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return token;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = getDb();
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, sha256(token)));
  }
  jar.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const [row] = await db
    .select({ u: users, s: sessions })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date()), sql`${sessions.revokedAt} is null`))
    .limit(1);
  if (!row || row.u.status !== "active") return null;

  const roleRows = await db
    .select({ key: roleTable.key, businessId: userRoles.businessId, slug: businesses.slug, name: businesses.name, status: businesses.status })
    .from(userRoles)
    .leftJoin(roleTable, eq(roleTable.id, userRoles.roleId))
    .leftJoin(businesses, eq(businesses.id, userRoles.businessId))
    .where(eq(userRoles.userId, row.u.id));

  const memberRows = await db
    .select({ businessId: businessMembers.businessId, key: roleTable.key, slug: businesses.slug, name: businesses.name, status: businesses.status })
    .from(businessMembers)
    .leftJoin(roleTable, eq(roleTable.id, businessMembers.roleId))
    .leftJoin(businesses, eq(businesses.id, businessMembers.businessId))
    .where(eq(businessMembers.userId, row.u.id));

  const union: RoleRow[] = [
    ...roleRows,
    ...memberRows,
  ];
  const seen = new Set<string>();
  type RoleRow = { key: string | null; businessId: string | null; slug: string | null; name: string | null; status: string | null };
  const roles: RoleRow[] = [];
  for (const r of union) {
    const k = `${r.businessId}:${r.key}`;
    if (!seen.has(k)) { seen.add(k); roles.push(r); }
  }
  const typed = roles;
  return {
    userId: row.u.id,
    email: row.u.email,
    name: row.u.name,
    platformRoles: typed.filter((r) => !r.businessId && r.key).map((r) => r.key as string),
    memberships: typed.filter((r) => r.businessId && r.key).map((r) => ({
      businessId: r.businessId as string, roleKey: r.key as string, slug: r.slug ?? "", name: r.name ?? "", status: r.status ?? "",
    })),
  };
}

/* ------------------------------ permissions ------------------------------ */
/** Permission strings from plan.md 34. Missing keys are a hard error, not a silent allow. */
export const PERMISSIONS = [
  "vendors.view", "vendors.update", "vendors.suspend", "vendors.verify",
  "catalogue.view", "catalogue.moderate", "catalogue.delete",
  "payments.view", "payments.verify", "payments.reject", "payments.refund",
  "subscriptions.manage", "addons.manage",
  "categories.manage", "schema.manage",
  "settings.manage", "cms.manage",
  "analytics.view", "audit_logs.view", "reports.moderate",
  "media.view", "media.delete",
  "business.update", "business.members.manage",
  "catalogue.edit", "leads.edit", "whatsapp.manage", "storefront.edit", "billing.pay",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_GRANTS: Record<string, Permission[]> = {
  super_admin: [...PERMISSIONS],
  administrator: ["vendors.view", "vendors.update", "vendors.suspend", "vendors.verify", "catalogue.view", "catalogue.moderate", "catalogue.delete", "categories.manage", "schema.manage", "analytics.view", "reports.moderate", "media.view", "media.delete", "payments.view", "settings.manage"],
  finance_admin: ["payments.view", "payments.verify", "payments.reject", "payments.refund", "subscriptions.manage", "addons.manage", "vendors.view", "analytics.view"],
  content_admin: ["categories.manage", "schema.manage", "cms.manage", "catalogue.view", "catalogue.moderate", "media.view"],
  support_admin: ["vendors.view", "catalogue.view", "analytics.view", "reports.moderate"],
  moderator: ["catalogue.view", "catalogue.moderate", "reports.moderate", "media.delete"],
  analyst: ["analytics.view", "vendors.view", "catalogue.view", "payments.view"],
  owner: [...PERMISSIONS.filter((p) => !p.startsWith("vendors.") && !p.startsWith("payments.") && !p.startsWith("categories.") && !p.startsWith("schema.") && !p.startsWith("settings.") && !p.startsWith("cms.") && !p.startsWith("audit") && !p.startsWith("subscriptions") && !p.startsWith("addons") && !p.startsWith("catalogue.moderate"))],
  manager: ["business.update", "catalogue.edit", "catalogue.delete", "leads.edit", "whatsapp.manage", "storefront.edit", "billing.pay", "media.view", "media.delete", "analytics.view", "catalogue.view"],
  sales: ["leads.edit", "catalogue.view", "analytics.view"],
  catalogue_manager: ["catalogue.edit", "catalogue.view", "media.view", "media.delete", "storefront.edit"],
  support: ["leads.edit", "catalogue.view"],
  accountant: ["billing.pay", "payments.view", "analytics.view"],
  buyer: [],
};

export class AuthError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
  }
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new AuthError(401, "Please sign in to continue.");
  return u;
}

/** Platform-scope guard (admin). */
export async function requirePermission(p: Permission): Promise<SessionUser> {
  const u = await requireUser();
  if (!(await userHasPermission(u, p))) throw new AuthError(403, `Your account cannot do this (${p}).`);
  return u;
}

/**
 * Tenant-scope guard (invariant I1 + BUILD_PLAN 10.2): membership AND permission in one
 * call. Every vendor-side action must use this rather than checking a payload businessId.
 */
export async function requireMembership(businessId: string, p: Permission): Promise<{ user: SessionUser; businessId: string }> {
  const u = await requireUser();
  const mine = u.memberships.find((m) => m.businessId === businessId);
  if (!mine) throw new AuthError(403, "That store is not yours.");
  if (!(await hasRolePermission(mine.roleKey, p))) throw new AuthError(403, `Your role (${mine.roleKey}) cannot do this (${p}).`);
  return { user: u, businessId };
}

export async function userHasPermission(u: SessionUser, p: Permission) {
  for (const r of u.platformRoles) if (await hasRolePermission(r, p)) return true;
  return false;
}

/** Reads grants from the DB when seeded, falling back to the code map so dev never deadlocks. */
async function hasRolePermission(roleKey: string, p: Permission): Promise<boolean> {
  if (!roleKey) return false;
  try {
    const db = getDb();
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(rolePermissions)
      .innerJoin(roleTable, eq(roleTable.id, rolePermissions.roleId))
      .innerJoin(permissionTable, eq(permissionTable.id, rolePermissions.permissionId))
      .where(and(eq(roleTable.key, roleKey), eq(permissionTable.key, p)));
    if (Number(row?.n ?? 0) > 0) return true;
    const configured = await db.select({ n: sql<number>`count(*)::int` }).from(rolePermissions).limit(1);
    if (Number(configured[0]?.n ?? 0) > 0) return false;   // DB is the authority once seeded
  } catch { /* table missing in a fresh dev db */ }
  return ROLE_GRANTS[roleKey]?.includes(p) ?? false;
}

/* ------------------------------ audit (constitution rule 3) ------------------------------ */
export async function audit(input: {
  actorUserId?: string | null;
  actorKind?: "user" | "system" | "cron" | "webhook";
  action: string;
  resource: string;
  resourceId?: string | null;
  businessId?: string | null;
  before?: unknown;
  after?: unknown;
  req?: Request;
}) {
  const db = getDb();
  await db.insert(auditLogs).values({
    actorUserId: input.actorUserId ?? null,
    actorKind: input.actorKind ?? "user",
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId ?? null,
    businessId: input.businessId ?? null,
    before: (input.before ?? null) as never,
    after: (input.after ?? null) as never,
    ip: input.req ? (input.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null) : null,
    userAgent: input.req ? (input.req.headers.get("user-agent")?.slice(0, 300) ?? null) : null,
  });
}

/* ------------------------------ throttling (plan.md 13.1) ------------------------------ */
export const THROTTLE = { windowMs: 15 * 60_000, max: 8, lockoutMs: 15 * 60_000 };

export async function registerFailedLogin(email: string) {
  const db = getDb();
  const [u] = await db.select().from(users).where(sql`lower(${users.email}) = lower(${email})`).limit(1);
  if (!u) return null;
  const within = u.failedAttempts >= THROTTLE.max && u.lockedUntil && u.lockedUntil > new Date();
  const attempts = within ? u.failedAttempts + 1 : 1;
  const lockedUntil = attempts >= THROTTLE.max ? new Date(Date.now() + THROTTLE.lockoutMs) : null;
  await db.update(users).set({ failedAttempts: attempts, lockedUntil }).where(eq(users.id, u.id));
  return lockedUntil;
}

export async function clearLoginFailures(userId: string) {
  await getDb().update(users).set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, userId));
}

export const isLocked = (u: { failedAttempts: number; lockedUntil: Date | null }) =>
  u.failedAttempts >= THROTTLE.max && !!u.lockedUntil && u.lockedUntil > new Date();
