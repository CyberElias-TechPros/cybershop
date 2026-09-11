import { NextRequest } from 'next/server';
import { WORKER_URL, WORKER_INTERNAL_SECRET } from '@/lib/config';

/**
 * Same-origin API proxy: browser → Next.js → CyberShop Worker.
 *
 * The Worker is never exposed publicly. This proxy is the only bridge and it
 * authenticates with the shared internal secret + forwards the real client IP
 * (Vercel sets x-forwarded-for on incoming requests; x-vercel-ip is the
 * fallback) so the Worker's per-IP rate limiting and analytics stay correct.
 */

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'content-encoding',
]);

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (xff) return xff;
  return req.headers.get('x-vercel-ip')?.trim() || 'unknown';
}

async function proxy(req: NextRequest, { method }: { method: string }) {
  // [...path] rest param: req.nextUrl.pathname is /api/... — derive the suffix.
  const suffix = req.nextUrl.pathname.replace(/^\/api\//, '');
  const query = req.nextUrl.search;
  const target = `${WORKER_URL}/api/${suffix}${query}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === 'host' || k === 'connection' || k === 'content-length' || k === 'x-forwarded-for' || k === 'x-internal-secret' || k === 'x-vercel-ip') return;
    headers.set(key, value);
  });
  headers.set('x-internal-secret', WORKER_INTERNAL_SECRET);
  headers.set('x-forwarded-for', clientIp(req));

  const hasBody = !['GET', 'HEAD'].includes(method);
  const upstream = await fetch(target, {
    method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    cache: 'no-store',
    redirect: 'manual',
  });

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (HOP_BY_HOP.has(k) || k === 'set-cookie') return;
    out.set(key, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) out.append('set-cookie', cookie);
  if (!upstream.ok) {
    // Don't cache or leak anything; pass the body through for API clients.
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}

export async function GET(req: NextRequest) {
  return proxy(req, { method: 'GET' });
}
export async function POST(req: NextRequest) {
  return proxy(req, { method: 'POST' });
}
export async function PUT(req: NextRequest) {
  return proxy(req, { method: 'PUT' });
}
export async function PATCH(req: NextRequest) {
  return proxy(req, { method: 'PATCH' });
}
export async function DELETE(req: NextRequest) {
  return proxy(req, { method: 'DELETE' });
}
