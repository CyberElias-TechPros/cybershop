import type { MetadataRoute } from 'next';
import { WORKER_URL, WORKER_INTERNAL_SECRET, SITE_URL } from '@/lib/config';

/**
 * Sitemap: the Worker owns the URL inventory (it knows every published
 * business + listing). We fetch its XML and re-emit it through Next so the
 * sitemap always lives at the site origin crawlers expect.
 *
 * Failure mode matters: a worker hiccup must never shrink the sitemap to
 * just the homepage (that reads to crawlers as "everything is gone").
 * Keep the last good inventory in memory and serve it stale, loudly.
 */
let lastGood: { urls: string[]; at: number } | null = null;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const res = await fetch(`${WORKER_URL}/api/sitemap.xml`, {
      cache: 'no-store',
      headers: { 'x-internal-secret': WORKER_INTERNAL_SECRET },
    });
    if (!res.ok) throw new Error(`worker sitemap ${res.status}`);
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]!);
    if (locs.length === 0) throw new Error('empty sitemap');
    lastGood = { urls: locs, at: Date.now() };
    return locs.map((url) => ({ url }));
  } catch (err) {
    console.error('[sitemap] worker fetch failed, serving last good inventory:', err);
    if (lastGood) return lastGood.urls.map((url) => ({ url }));
    return [{ url: SITE_URL }];
  }
}
