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
const request = cache(async <T,>(path: string, ip: string, cookie: string | null): Promise<T> => {
  const res = await fetch(`${WORKER_URL}/api${path}`, {
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      'x-internal-secret': WORKER_INTERNAL_SECRET,
      'x-forwarded-for': ip,
      ...(cookie ? { cookie } : {}),
    },
  });
  if (res.status === 404) notFound();
  if (!res.ok) {
    let message = `API error ${res.status}`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j?.error?.message) message = j.error.message;
    } catch {
      /* non-JSON body */
    }
    throw new ApiError(res.status, message);
  }
  const j = (await res.json()) as T & { ok?: boolean };
  if (j && j.ok === false) throw new ApiError(res.status, 'API returned an error.');
  return j;
});

export async function api<T>(path: string, opts: { ip?: string; cookie?: string | null } = {}): Promise<T> {
  // Same IP for every call site in a request → same cache key → one round-trip.
  const ip = opts.ip ?? (await clientIp());
  return request<T>(path, ip, opts.cookie ?? null);
}
