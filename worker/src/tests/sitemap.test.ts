import { beforeAll, describe, expect, it } from 'vitest';
import { api, setupIntegration } from './harness';
import { xmlEscape } from '../lib/sitemap';

setupIntegration({ main: 'src/tests/fixtures/operations-worker.ts' });
const call = async (path: string, body: unknown) => {
  const response = await api(`/__test/${path}`, { method: 'POST', body });
  expect(response.status, response.text).toBe(200);
  return response.json;
};
beforeAll(async () => { expect((await api('/api/public/home')).status).toBe(200); });
const part = { kind: 'static', page: 0 };

describe('sitemap inventory, durable fallback and failure semantics', () => {
  it('escapes XML special characters once', () => {
    expect(xmlEscape('https://shop.test/a?x="one"&y=<two>\'')).toBe('https://shop.test/a?x=&quot;one&quot;&amp;y=&lt;two&gt;&apos;');
  });
  it('returns an index and separate canonical static inventory', async () => {
    const index = await api('/api/sitemap.xml', { authed: false });
    expect(index.status).toBe(200);
    expect(index.text).toContain('<sitemapindex');
    expect(index.text).toContain('http://localhost:3000/sitemaps/static/0.xml');
    const page = await api('/api/sitemap.xml/static/0', { authed: false });
    expect(page.status).toBe(200);
    expect(page.text).toContain('<urlset');
    expect(page.text).toContain('/categories/fashion');
    expect(page.text).not.toContain('/admin');
  });
  it('serves persisted last-good XML on inventory failure, with age and no-store', async () => {
    const good = await call('sitemap', { part });
    expect(good.headers['x-sitemap-state']).toBe('fresh');
    const fallback = await call('sitemap', { part, fail: true });
    expect(fallback.status).toBe(200);
    expect(fallback.xml).toBe(good.xml);
    expect(fallback.headers['x-sitemap-state']).toBe('stale');
    expect(fallback.headers['cache-control']).toBe('no-store');
    expect(Number(fallback.headers['x-sitemap-age'])).toBeGreaterThanOrEqual(0);
  });
  it('returns retryable 503 instead of homepage-only success on cold/over-age failure', async () => {
    const cold = await call('sitemap', { part: { kind: 'listings', page: 900 }, fail: true });
    expect(cold.status).toBe(503);
    expect(cold.headers['retry-after']).toBe('120');
    await call('snapshot-age', { part });
    const expired = await call('sitemap', { part, fail: true });
    expect(expired.status).toBe(503);
    expect(expired.xml).not.toContain('<urlset');
  });
  it('paginates all 1005 listings without duplication and excludes deleted parents', async () => {
    const seeded = await call('sitemap-seed', {});
    const index = await api('/api/sitemap.xml', { authed: false });
    expect(index.text).toContain('/sitemaps/listings/0.xml');
    expect(index.text).toContain('/sitemaps/listings/1.xml');
    const pages = await Promise.all([0, 1].map((p) => api(`/api/sitemap.xml/listings/${p}`, { authed: false })));
    const locs = pages.flatMap((r) => [...r.text!.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]));
    expect(locs).toHaveLength(1005);
    expect(new Set(locs).size).toBe(1005);
    expect(locs.some((s) => s.endsWith('/page-item-1005'))).toBe(true);
    await call('business-delete', { id: seeded.businessId });
    const hidden = await api('/api/sitemap.xml/listings/0', { authed: false });
    expect(hidden.text).not.toContain('<loc>');
    const hiddenIndex = await api('/api/sitemap.xml', { authed: false });
    expect(hiddenIndex.text).not.toContain('/sitemaps/listings/');
    expect(hiddenIndex.text).not.toContain('/sitemaps/businesses/');
  });
  it.each(['/api/sitemap.xml/listings/-1', '/api/sitemap.xml/unknown/0', '/api/sitemap.xml/static/1', '/api/sitemap.xml/listings/9999999999'])('rejects invalid sitemap part %s', async (path) => {
    expect((await api(path, { authed: false })).status).toBe(404);
  });
});
