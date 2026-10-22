import type { Env } from '../config';
import { nowUnix } from './util';

/** Atomic shared lease. Owner tokens fence release from stale invocations. */
export async function acquireLease(env: Env, name: string, ttlSeconds: number): Promise<string | null> {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 3600) throw new Error('Invalid lease TTL');
  const owner = crypto.randomUUID();
  const now = nowUnix();
  const result = await env.DB.prepare(`INSERT INTO job_leases (name,owner,expires_at) VALUES (?,?,?)
    ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE job_leases.expires_at<=?`)
    .bind(name, owner, now + ttlSeconds, now).run();
  return result.meta.changes === 1 ? owner : null;
}
export async function releaseLease(env: Env, name: string, owner: string): Promise<boolean> {
  return (await env.DB.prepare('DELETE FROM job_leases WHERE name=? AND owner=?').bind(name, owner).run()).meta.changes === 1;
}
