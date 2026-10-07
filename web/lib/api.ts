import { cache } from 'react';
import { notFound } from 'next/navigation';
import { WORKER_URL, WORKER_INTERNAL_SECRET } from './config';
import { clientIp } from './ip';

/** Error thrown for non-2xx API responses. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Transient upstream failures worth retrying.
 *
 * This is the root cause of the "tap Dashboard, get an error screen, tap Try
 * again, it works" bug: on Vercel the very first request of a cold serverless
 * invocation races the Cloudflare Worker's cold start, and that race fails as
 * a network error or a 5xx. Retrying inside the request (instead of making the
 * visitor do it) removes the dead tap entirely.
 */
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504, 521, 522, 523, 524]);

/** Per-attempt timeout. A hung Worker must not eat the visitor's page load. */
const TIMEOUT_MS = Number(process.env.WORKER_TIMEOUT_MS ?? 8000);
/** Total attempts for a read: 1 initial + 2 retries. */
const ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Server-side fetch against the CyberShop API Worker.
 *
 * The Worker only trusts requests carrying the internal secret (it cannot be
 * reached directly from the public internet in production), so every call adds
 * the secret + the caller's IP in x-forwarded-for (rate limiting / analytics).
 *
 * GETs are deduplicated per render pass with React's `cache()`: `generateMetadata`
 * and the page component ask for the same document, and the Worker records a
 * `storefront_view` / `item_view` on every hit — without this, each page view
 * was counted twice (and cost two Worker round-trips).
 */

/** How long a *public, unauthenticated* response may be reused. See `api()`. */
export const PUBLIC_REVALIDATE = 60;
/** Taxonomies (cities, item types, categories) change about once a year. */
export const TAXONOMY_REVALIDATE = 300;

const request = cache(
  async <T,>(path: string, ip: string, cookie: string | null, revalidate = 0): Promise<T> => {
  const url = `${WORKER_URL}/api${path}`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-internal-secret': WORKER_INTERNAL_SECRET,
    'x-forwarded-for': ip,
    ...(cookie ? { cookie } : {}),
  };

  /**
   * A response fetched *with* a session cookie is shaped by that session —
   * the public endpoints filter out any business the signed-in visitor has
   * blocked. Such a response must never be reused for anyone else: it would
   * both leak one visitor's block list and, worse, quietly show a blocked
   * seller back to the person who blocked them.
   *
   * So the data cache is only ever used for anonymous fetches. Signed-in
   * visitors always hit the Worker and always get their own view.
   */
  const ttl = cookie ? 0 : revalidate;
  const cacheOpt: RequestInit & { next?: { revalidate: number } } =
    ttl > 0 ? { next: { revalidate: ttl } } : { cache: 'no-store' };

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        ...cacheOpt,
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      // Network error / timeout — retryable.
      lastErr = e;
      if (attempt < ATTEMPTS) {
        await sleep(120 * attempt);
        continue;
      }
      throw new ApiError(503, 'The catalogue service is not answering. Please try again.');
    }

    if (res.status === 404) notFound();
    if (res.ok) {
      const j = (await res.json().catch(() => ({}))) as T & { ok?: boolean };
      if (j && j.ok === false) throw new ApiError(res.status, 'API returned an error.');
      return j;
    }

    let message = `API error ${res.status}`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j?.error?.message) message = j.error.message;
    } catch {
      /* non-JSON body */
    }

    const err = new ApiError(res.status, message);
    lastErr = err;
    if (!RETRYABLE.has(res.status) || attempt === ATTEMPTS) throw err;
    await sleep(140 * attempt);
  }
  throw lastErr instanceof Error ? lastErr : new ApiError(500, 'Unexpected API failure.');
});

export async function api<T>(
  path: string,
  opts: { ip?: string; cookie?: string | null; revalidate?: number } = {},
): Promise<T> {
  // Same IP for every call site in a request → same cache key → one round-trip.
  const ip = opts.ip ?? (await clientIp());
  return request<T>(path, ip, opts.cookie ?? null, opts.revalidate ?? 0);
}
