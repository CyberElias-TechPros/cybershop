/** Server-side environment (all optional for local dev with sane defaults). */

export const WORKER_URL = (process.env.WORKER_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '');

/** Must match the Worker's INTERNAL_SECRET. */
export const WORKER_INTERNAL_SECRET = process.env.WORKER_INTERNAL_SECRET ?? '';

/** Public origin of this site — canonical + Open Graph URLs. */
export const SITE_URL = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** Turn a (possibly relative) media URL from the Worker into an absolute one for OG tags. */
export function absUrl(path: string): string {
  if (!path) return SITE_URL;
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}
