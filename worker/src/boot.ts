import type { Env } from './config';
import { hashPassword } from './lib/crypto';

let checked = false;

/**
 * First-boot admin creation. Explicit env configuration only (never a static
 * password in git): set SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD in the Worker
 * secrets to create the first admin. Runs at most once per Worker instance.
 */
export async function ensureAdmin(env: Env): Promise<void> {
  if (checked) return;
  checked = true;
  const email = env.SEED_ADMIN_EMAIL;
  const password = env.SEED_ADMIN_PASSWORD;
  if (!email || !password) return;
  const existing = (await env.DB.prepare('SELECT id FROM users WHERE role = \'admin\' LIMIT 1').first()) as { id: number } | null;
  if (existing) return;
  const emailTaken = (await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()) as { id: number } | null;
  if (emailTaken) return;
  const hash = await hashPassword(password);
  await env.DB.prepare(`INSERT INTO users (role, name, email, password_hash, status) VALUES ('admin', 'Platform Admin', ?, ?, 'active')`).bind(email, hash).run();
  console.log('[boot] first admin account created');
}
