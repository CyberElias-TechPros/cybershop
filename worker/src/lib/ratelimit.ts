import type { Env } from '../config';
import { nowUnix } from './util';
import { rateLimited } from './errors';

interface BucketRow { bucket: string; count: number }

/**
 * Sliding fixed-window rate limit backed by D1.
 * Key format: `${scope}:${identifier}` → `${scope}:${identifier}:${windowStart}`
 * @throws AppError(429) when the limit is exceeded.
 */
export async function rateLimit(
  env: Env,
  scope: string,
  identifier: string,
  limit: number,
  windowSec: number
): Promise<void> {
  const windowStart = Math.floor(nowUnix() / windowSec) * windowSec;
  const bucket = `${scope}:${identifier}:${windowStart}`;
  await env.DB.prepare(
    `INSERT INTO rate_limits (bucket, count) VALUES (?, 1)
     ON CONFLICT(bucket) DO UPDATE SET count = count + 1`
  ).bind(bucket).run();
  const row = (await env.DB.prepare('SELECT bucket, count FROM rate_limits WHERE bucket = ?').bind(bucket).first()) as BucketRow | null;
  if (row && row.count > limit) {
    throw rateLimited(windowSec);
  }
}

export async function pruneRateLimits(env: Env, keepWindowSec = 3600): Promise<void> {
  const cutoff = Math.floor((nowUnix() - 2 * keepWindowSec) / keepWindowSec) * keepWindowSec;
  await env.DB.prepare('DELETE FROM rate_limits WHERE CAST(substr(bucket, -10) AS INTEGER) < ?').bind(String(cutoff)).run();
}
