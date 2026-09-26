import type { Env } from '../config';
import { badRequest } from './errors';

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export function normalizeDomain(raw: unknown): string {
  let host = String(raw || '').trim().toLowerCase();
  host = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
  if (host.startsWith('www.')) host = host.slice(4);
  if (!DOMAIN_RE.test(host) || host.length > 180) throw badRequest('Enter a real domain, like shop.yourbrand.ng.');
  if (host === 'localhost' || host.endsWith('.workers.dev') || host.endsWith('.vercel.app') || host.endsWith('.e2b.app')) {
    throw badRequest('That host cannot be used as a store domain.');
  }
  return host;
}

/** DNS-over-HTTPS TXT lookup. No extra key — Cloudflare’s public resolver. */
export async function domainTxtHasToken(domain: string, token: string): Promise<boolean> {
  const name = `_cybershop.${domain}`;
  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`, {
      headers: { accept: 'application/dns-json' },
    });
    if (!res.ok) return false;
    const j = (await res.json()) as { Answer?: { data?: string }[] };
    const blobs = (j.Answer || []).map((a) => String(a.data || '').replace(/^"|"$/g, ''));
    if (blobs.some((b) => b.includes(token))) return true;
  } catch {
    /* fall through to the well-known file */
  }
  try {
    const file = await fetch(`https://${domain}/.well-known/cybershop-domain.txt`, { redirect: 'follow' });
    if (!file.ok) return false;
    const text = (await file.text()).slice(0, 200);
    return text.includes(token);
  } catch {
    return false;
  }
}

/**
 * Optional: attach the domain to the Vercel project so TLS is issued.
 * No-op (and not an error) when VERCEL_TOKEN / VERCEL_PROJECT_ID are unset —
 * the vendor still gets DNS instructions and the middleware will route once
 * the domain is added in the Vercel dashboard.
 */
export async function attachVercelDomain(env: Env, domain: string): Promise<{ attached: boolean; detail: string }> {
  if (!env.VERCEL_TOKEN || !env.VERCEL_PROJECT_ID) {
    return { attached: false, detail: 'Vercel token not configured — add the domain in the Vercel project when you are ready.' };
  }
  const team = env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}` : '';
  try {
    const res = await fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(env.VERCEL_PROJECT_ID)}/domains${team}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.VERCEL_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: domain }),
    });
    if (res.ok || res.status === 409) return { attached: true, detail: 'Domain handed to Vercel for TLS.' };
    const text = (await res.text()).slice(0, 240);
    return { attached: false, detail: `Vercel did not attach the domain (${res.status}). ${text}` };
  } catch (e) {
    return { attached: false, detail: e instanceof Error ? e.message : 'Vercel request failed.' };
  }
}
