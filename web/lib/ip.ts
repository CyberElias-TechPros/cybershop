import { headers } from 'next/headers';

/** Best-effort real client IP for server-side API calls (analytics / rate limits). */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-vercel-ip')?.trim() || 'ssr';
  } catch {
    return 'ssr';
  }
}
