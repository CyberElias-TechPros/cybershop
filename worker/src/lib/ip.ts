import type { Context } from 'hono';
import type { Env } from '../config';

/**
 * Resolve the originating client IP for rate limiting and analytics.
 *
 * Production traffic arrives via the Next.js proxy (Vercel), which authenticates
 * with `x-internal-secret` and sets `x-forwarded-for` to the real client IP —
 * so the first XFF entry is trusted ONLY for secret-verified requests.
 *
 * Direct Worker requests (webhooks, cron, media files) have no proxy in front,
 * so we fall back to `cf-connecting-ip`, which Cloudflare sets and clients
 * cannot forge. Falling back to XFF for unverified requests would let an
 * attacker mint a fresh rate-limit bucket per request by rotating XFF.
 */
export function clientIp(c: Context<{ Bindings: Env }>): string {
  const xff = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  const trustedProxy = c.req.header('x-internal-secret') === c.env.INTERNAL_SECRET;
  if (trustedProxy && xff) return xff;
  return c.req.header('cf-connecting-ip') || xff || 'unknown';
}
