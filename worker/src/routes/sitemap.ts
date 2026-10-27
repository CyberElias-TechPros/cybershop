import { Hono } from 'hono';
import type { Env } from '../config';
import { serveSitemap, type SitemapPart } from '../lib/sitemap';

const app = new Hono<{ Bindings: Env }>();
app.get('/', (c) => serveSitemap(c.env, { kind: 'index', page: 0 }));
app.get('/:kind/:page', (c) => {
  const kind = c.req.param('kind');
  const rawPage = c.req.param('page');
  if (!['static', 'businesses', 'listings'].includes(kind) || !/^(0|[1-9][0-9]{0,8})$/.test(rawPage) || (kind === 'static' && rawPage !== '0')) return c.notFound();
  return serveSitemap(c.env, { kind: kind as SitemapPart['kind'], page: Number(rawPage) });
});
export default app;
