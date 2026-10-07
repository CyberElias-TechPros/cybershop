import type { Env } from '../config';

/**
 * Server errors, counted and escalated.
 *
 * A production app that fails silently is an app that fails for weeks. Every
 * unhandled error is written to `error_log` (nothing else — never a stack with
 * secrets in it), and when the rate crosses a threshold inside an hour, the
 * admins get *one* notification. One, not fifty: `alert_state` exists exactly
 * so a bad hour does not turn into an inbox you learn to ignore.
 */

export interface ErrorInput {
  scope: 'api' | 'cron' | 'webhook' | 'web';
  route?: string | null;
  status?: number | null;
  code?: string | null;
  message?: string | null;
}

/** Trim anything that could carry a secret or a token into the log. */
function scrub(value: string | null | undefined, max = 300): string | null {
  if (!value) return null;
  return value
    .replace(/(sk|pk)_(live|test)_[A-Za-z0-9]+/g, '$1_$2_***')
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, '[hex]')
    .replace(/([?&](?:key|token|secret|password|code)=)[^&\s]+/gi, '$1***')
    .slice(0, max);
}

export async function logError(env: Env, input: ErrorInput): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO error_log (scope, route, status, code, message, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(input.scope, input.route ? input.route.slice(0, 200) : null, input.status ?? null, input.code ?? null, scrub(input.message), new Date().toISOString()).run();
  } catch {
    // Logging must never become the next error.
  }
}

export interface AlertRule {
  key: string;
  /** Errors of at least this HTTP status within the window that count. */
  minStatus: number;
  threshold: number;
  windowMinutes: number;
  /** Do not re-alert for this long, however bad it gets. */
  cooldownMinutes: number;
  title: string;
  body: string;
}

export const ALERT_RULES: AlertRule[] = [
  {
    key: 'error_5xx',
    minStatus: 500,
    threshold: 5,
    windowMinutes: 60,
    cooldownMinutes: 60,
    title: 'Server errors on CyberShop',
    body: 'Five or more 5xx responses in the last hour. Check Admin → Health before buyers tell you.',
  },
  {
    key: 'error_paystack',
    minStatus: 400,
    threshold: 3,
    windowMinutes: 60,
    cooldownMinutes: 60,
    title: 'Payment errors on CyberShop',
    body: 'Paystack calls are failing. Money that cannot be charged is money that cannot be made.',
  },
];

/** True when the alert fired now; false when it is inside its cooldown. */
export async function shouldAlert(env: Env, rule: AlertRule): Promise<boolean> {
  const since = new Date(Date.now() - rule.windowMinutes * 60_000).toISOString();
  const where =
    rule.key === 'error_paystack'
      ? `scope IN ('api','webhook') AND (route LIKE '%paystack%' OR code LIKE '%paystack%')`
      : `status >= ?`;
  const stmt =
    rule.key === 'error_paystack'
      ? env.DB.prepare(`SELECT COUNT(*) AS n FROM error_log WHERE ${where} AND created_at >= ?`).bind(since)
      : env.DB.prepare(`SELECT COUNT(*) AS n FROM error_log WHERE ${where} AND created_at >= ?`).bind(rule.minStatus, since);
  const row = (await stmt.first()) as { n: number } | null;
  if (!row || row.n < rule.threshold) return false;

  const cooldown = new Date(Date.now() - rule.cooldownMinutes * 60_000).toISOString();
  const state = (await env.DB.prepare('SELECT last_sent_at FROM alert_state WHERE alert_key = ?').bind(rule.key).first()) as
    | { last_sent_at: string }
    | null;
  if (state && state.last_sent_at >= cooldown) return false;
  return true;
}

export async function markAlertSent(env: Env, key: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO alert_state (alert_key, last_sent_at, count) VALUES (?, ?, 1)
     ON CONFLICT(alert_key) DO UPDATE SET last_sent_at = excluded.last_sent_at, count = count + 1`
  ).bind(key, new Date().toISOString()).run();
}

export interface HealthSnapshot {
  ok: boolean;
  window_hours: number;
  total: number;
  by_status: { status: number; n: number }[];
  by_scope: { scope: string; n: number }[];
  top_routes: { route: string; n: number }[];
  last_error_at: string | null;
}

export async function healthSnapshot(env: Env, hours = 24): Promise<HealthSnapshot> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const [total, byStatus, byScope, topRoutes, last] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM error_log WHERE created_at >= ?`).bind(since).first() as Promise<{ n: number } | null>,
    env.DB.prepare(`SELECT status, COUNT(*) AS n FROM error_log WHERE created_at >= ? GROUP BY status ORDER BY n DESC LIMIT 10`).bind(since).all(),
    env.DB.prepare(`SELECT scope, COUNT(*) AS n FROM error_log WHERE created_at >= ? GROUP BY scope ORDER BY n DESC LIMIT 10`).bind(since).all(),
    env.DB.prepare(
      `SELECT COALESCE(route, '(unknown)') AS route, COUNT(*) AS n FROM error_log WHERE created_at >= ? GROUP BY route ORDER BY n DESC LIMIT 10`
    ).bind(since).all(),
    env.DB.prepare(`SELECT MAX(created_at) AS t FROM error_log`).first() as Promise<{ t: string | null } | null>,
  ]);
  return {
    ok: (total?.n ?? 0) === 0,
    window_hours: hours,
    total: total?.n ?? 0,
    by_status: (byStatus.results as { status: number; n: number }[]) ?? [],
    by_scope: (byScope.results as { scope: string; n: number }[]) ?? [],
    top_routes: (topRoutes.results as { route: string; n: number }[]) ?? [],
    last_error_at: last?.t ?? null,
  };
}

/** Housekeeping: error logs are diagnostic, not history. Keep 30 days. */
export async function pruneErrorLog(env: Env, keepDays = 30): Promise<number> {
  const res = await env.DB.prepare(`DELETE FROM error_log WHERE created_at < datetime('now', ?)`).bind(`-${keepDays} days`).run();
  return res.meta.changes ?? 0;
}
