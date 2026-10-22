import { proxySitemap } from '@/lib/sitemap';
export const dynamic = 'force-dynamic';
export async function GET() { return proxySitemap(); }
