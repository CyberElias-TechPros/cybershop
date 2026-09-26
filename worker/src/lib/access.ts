import type { Context } from 'hono';
import type { Env } from '../config';
import { forbidden } from './errors';

export const STAFF_ROLES = ['manager', 'sales', 'catalogue', 'support', 'accountant'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export interface VendorBinding {
  business_id: number | null;
  member_role: string | null;
}

/** Owner wins. Otherwise the newest active staff seat. */
export async function resolveVendorBinding(env: Env, userId: number): Promise<VendorBinding> {
  const owned = (await env.DB.prepare(
    'SELECT id FROM businesses WHERE owner_user_id = ? AND deleted_at IS NULL'
  ).bind(userId).first()) as { id: number } | null;
  if (owned) return { business_id: owned.id, member_role: 'owner' };
  const mem = (await env.DB.prepare(
    `SELECT m.business_id, m.role FROM business_members m
     JOIN businesses b ON b.id = m.business_id
     WHERE m.user_id = ? AND m.status = 'active' AND b.deleted_at IS NULL
     ORDER BY m.created_at DESC LIMIT 1`
  ).bind(userId).first()) as { business_id: number; role: string } | null;
  if (mem) return { business_id: mem.business_id, member_role: mem.role };
  return { business_id: null, member_role: null };
}

const READ_ANY = [
  /^\/api\/vendor\/business$/,
  /^\/api\/vendor\/overview$/,
  /^\/api\/vendor\/notifications(\/|$)/,
  /^\/api\/vendor\/premium$/,
  /^\/api\/vendor\/item-types$/,
];

const ROLE_PATHS: Record<string, RegExp[]> = {
  catalogue: [
    /^\/api\/vendor\/items(\/|$)/,
    /^\/api\/vendor\/media(\/|$)/,
    /^\/api\/vendor\/offers(\/|$)/,
    /^\/api\/vendor\/templates(\/|$)/,
    /^\/api\/vendor\/catalog\//,
  ],
  sales: [
    /^\/api\/vendor\/inquiries(\/|$)/,
    /^\/api\/vendor\/whatsapp(\/|$)/,
    /^\/api\/vendor\/threads(\/|$)/,
    /^\/api\/vendor\/deposits(\/|$)/,
  ],
  support: [
    /^\/api\/vendor\/inquiries(\/|$)/,
    /^\/api\/vendor\/threads(\/|$)/,
  ],
  accountant: [
    /^\/api\/vendor\/plans$/,
    /^\/api\/vendor\/payments(\/|$)/,
    /^\/api\/vendor\/payment-intent$/,
    /^\/api\/vendor\/payment-proof\//,
  ],
};

/**
 * Staff seats are real permissions, not a label. Owners and managers can do
 * everything a vendor route allows. Other roles only touch their desk.
 * Business profile edits stay with the owner and manager.
 */
export function assertStaffPermission(method: string, path: string, role: string): void {
  if (role === 'owner' || role === 'manager') return;
  if (method === 'GET' && READ_ANY.some((r) => r.test(path))) return;
  if (method === 'POST' && /^\/api\/vendor\/notifications\/read$/.test(path)) return;
  if (path === '/api/vendor/business' && method !== 'GET') {
    throw forbidden('Only the owner or a manager can change store settings.');
  }
  const allowed = ROLE_PATHS[role] ?? [];
  if (allowed.some((r) => r.test(path))) return;
  throw forbidden('Your staff role cannot do that. Ask the owner if you need access.');
}

export function assertStaffPermissionFromContext(c: Context, role: string): void {
  assertStaffPermission(c.req.method, c.req.path, role);
}
