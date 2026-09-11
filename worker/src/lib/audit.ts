import type { Env } from '../config';
import { nowIso } from './util';

/** Record an admin/sensitive action. Never pass secrets in meta. */
export async function audit(
  env: Env,
  args: {
    /** null for system actors (webhooks, cron) — no human behind the action. */
    actor: { id: number | null; role: string };
    action: string;
    entityType?: string;
    entityId?: number | null;
    ip?: string | null;
    meta?: Record<string, unknown>;
  }
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, ip, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    args.actor.id ?? null,
    args.actor.role,
    args.action,
    args.entityType ?? null,
    args.entityId ?? null,
    args.ip ?? null,
    args.meta ? JSON.stringify(args.meta) : null,
    nowIso()
  ).run();
}
