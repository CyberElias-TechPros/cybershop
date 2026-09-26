import { NextRequest, NextResponse } from 'next/server';

/**
 * Verified custom domains rewrite to that vendor's storefront.
 * The platform host, localhost, and preview hosts are left alone.
 * TLS attachment is separate (Vercel) — this only routes once the host arrives here.
 */
export async function middleware(req: NextRequest) {
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(':')[0]!.toLowerCase();
  const siteHost = (process.env.SITE_URL || '').replace(/^https?:\/\//, '').split('/')[0]!.split(':')[0]!.toLowerCase();
  if (!host || host === siteHost || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.e2b.app') || host.endsWith('.workers.dev') || host.endsWith('.vercel.app')) {
    return NextResponse.next();
  }
  const path = req.nextUrl.pathname;
  if (path.startsWith('/_next') || path.startsWith('/api') || path.startsWith('/icon-') || path === '/sw.js' || path === '/offline.html') {
    return NextResponse.next();
  }
  const worker = process.env.WORKER_URL;
  const secret = process.env.WORKER_INTERNAL_SECRET;
  if (!worker || !secret) return NextResponse.next();
  try {
    const res = await fetch(`${worker.replace(/\/$/, '')}/api/public/domain?host=${encodeURIComponent(host)}`, {
      headers: { 'x-internal-secret': secret },
      cache: 'no-store',
    });
    if (!res.ok) return NextResponse.next();
    const data = (await res.json()) as { slug?: string | null };
    if (!data.slug) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = path === '/' ? `/business/${data.slug}` : `/business/${data.slug}${path}`;
    return NextResponse.rewrite(url);
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
