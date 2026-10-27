import { WORKER_URL, WORKER_INTERNAL_SECRET } from './config';

/** Pass through the Worker's XML/index without regex parsing or double escaping. */
export async function proxySitemap(suffix = ''): Promise<Response> {
  try {
    const upstream = await fetch(`${WORKER_URL}/api/sitemap.xml${suffix}`, {
      cache: 'no-store', signal: AbortSignal.timeout(10_000),
      headers: { 'x-internal-secret': WORKER_INTERNAL_SECRET },
    });
    if (!upstream.ok) throw new Error('Sitemap upstream unavailable');
    const headers = new Headers({ 'content-type': 'application/xml; charset=utf-8', 'x-content-type-options': 'nosniff' });
    for (const name of ['cache-control', 'warning', 'x-sitemap-state', 'x-sitemap-age', 'x-sitemap-snapshot']) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { headers });
  } catch {
    console.error('[sitemap] upstream_unavailable');
    return new Response('Sitemap temporarily unavailable', { status: 503, headers: { 'cache-control': 'no-store', 'retry-after': '120', 'x-sitemap-state': 'unavailable' } });
  }
}
