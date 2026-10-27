import { proxySitemap } from '@/lib/sitemap';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ kind: string; page: string }> }) {
  const { kind, page } = await context.params;
  if (!['static', 'businesses', 'listings'].includes(kind) || !/^(0|[1-9][0-9]{0,8})\.xml$/.test(page)) return new Response('Not found', { status: 404 });
  return proxySitemap(`/${kind}/${page.slice(0, -4)}`);
}
