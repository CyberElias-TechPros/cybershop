export function nowIso(): string {
  return new Date().toISOString();
}

export function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

const RESERVED_SLUGS = new Set([
  'admin', 'api', 'dashboard', 'login', 'register', 'logout', 'search', 'businesses',
  'categories', 'settings', 'paystack', 'media', 'static', 'sitemap', 'robots', 'webhooks', 'www',
]);

export function assertSlugAvailable(slug: string): void {
  if (RESERVED_SLUGS.has(slug)) {
    throw new Error(`"${slug}" is a reserved name. Choose another.`);
  }
}

export function uuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function paymentReference(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  const b = crypto.getRandomValues(new Uint8Array(6));
  for (const x of b) s += chars[x % chars.length];
  return `CS-${new Date().getFullYear()}-${s}`;
}

export async function sha256Hex(data: string | ArrayBuffer): Promise<string> {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash), (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Salted hash of a client IP — we never store raw IPs. */
export async function ipHash(ip: string, salt: string): Promise<string> {
  return sha256Hex(`${salt}:${ip}`);
}

export function clampInt(v: unknown, min: number, max: number, fallback = min): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function parseMoneyKobo(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 100_000_000_000) {
    throw new Error('Invalid amount.');
  }
  return n;
}

/** Like parseMoneyKobo but returns null instead of throwing (for optional prices). */
export function parseMoneySafe(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 100_000_000_000) return null;
  return n;
}

export function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86400_000).toISOString();
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
