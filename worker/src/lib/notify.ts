import type { Env } from '../config';
import { nowIso } from './util';

export async function notify(
  env: Env,
  args: { userId: number; type: string; title: string; body?: string; data?: Record<string, unknown> }
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO notifications (user_id, type, title, body, data, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(args.userId, args.type, args.title, args.body ?? null, args.data ? JSON.stringify(args.data) : null, nowIso()).run();
}
