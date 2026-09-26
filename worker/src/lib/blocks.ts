import type { Env } from '../config';

export async function blockedBusinessIds(env: Env, userId: number | null | undefined): Promise<number[]> {
  if (!userId) return [];
  const rows = (await env.DB.prepare('SELECT business_id FROM blocks WHERE buyer_user_id = ?').bind(userId).all()).results as { business_id: number }[];
  return rows.map((r) => r.business_id);
}

export async function isBlocked(env: Env, userId: number | null | undefined, businessId: number): Promise<boolean> {
  if (!userId) return false;
  const row = await env.DB.prepare('SELECT 1 FROM blocks WHERE buyer_user_id = ? AND business_id = ?').bind(userId, businessId).first();
  return !!row;
}

/** SQL fragment. Caller appends the params. Empty when the visitor has no blocks. */
export function notInClause(ids: number[], column = 'b.id'): { sql: string; params: number[] } {
  if (!ids.length) return { sql: '', params: [] };
  return { sql: ` AND ${column} NOT IN (${ids.map(() => '?').join(',')})`, params: ids };
}
