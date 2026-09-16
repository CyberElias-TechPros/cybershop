import { AppError } from './errors';

/**
 * Password hashing for Cloudflare Workers.
 *
 * PBKDF2-SHA256 via WebCrypto (the only KDF reliably available in workerd).
 * Storage format (versioned, future migrations can add formats):
 *
 *   pbkdf2$<iterations>$<saltB64>$<hashB64>
 *
 * Legacy formats (read-only, transparently upgraded on successful login):
 *   sha256$<saltB64>$<hashB64>      3-part single digest (old intended format)
 *   sha256$<saltB64><hashB64>       2-part concatenation bug (salt is always
 *                                   16 bytes → 24 b64 chars; digest 32 bytes →
 *                                   44 b64 chars, so the split is unambiguous)
 */

const PBKDF2_ITERATIONS = 100_000;
const KEY_LEN_BITS = 256;
const SALT_LEN = 16;

const enc = new TextEncoder();

function b64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2Bits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    KEY_LEN_BITS
  );
  return new Uint8Array(bits);
}

async function sha256Bits(salt: Uint8Array, password: string): Promise<Uint8Array> {
  const bits = await crypto.subtle.digest('SHA-256', new Uint8Array([...salt, ...enc.encode(password)]));
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const bits = await pbkdf2Bits(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(bits)}`;
}

/** True when `stored` is not the current format and should be re-hashed after a successful verify. */
export function passwordNeedsUpgrade(stored: string): boolean {
  return !stored.startsWith(`pbkdf2$${PBKDF2_ITERATIONS}$`);
}

async function verifyLegacy(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts[0] !== 'sha256') return false;
  try {
    if (parts.length === 3) {
      const salt = fromB64(parts[1]);
      const expected = fromB64(parts[2]);
      const actual = await sha256Bits(salt, password);
      return timingSafeEq(actual, expected);
    }
    if (parts.length === 2) {
      // hashPassword's delimiter bug: b64(salt) + b64(digest) share one '$'.
      if (parts[1].length !== 24 + 44) return false;
      const salt = fromB64(parts[1].slice(0, 24));
      const expected = fromB64(parts[1].slice(24));
      const actual = await sha256Bits(salt, password);
      return timingSafeEq(actual, expected);
    }
    return false;
  } catch {
    return false;
  }
}

function timingSafeEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (stored.startsWith('pbkdf2$')) {
    const parts = stored.split('$');
    if (parts.length !== 4) return false;
    const iterations = Number(parts[1]);
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10_000_000) return false;
    try {
      const salt = fromB64(parts[2]);
      const expected = fromB64(parts[3]);
      const actual = await pbkdf2Bits(password, salt, iterations);
      return timingSafeEq(actual, expected);
    } catch {
      return false;
    }
  }
  return verifyLegacy(password, stored);
}

export async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig), (x) => x.toString(16).padStart(2, '0')).join('');
}

export async function verifyHmac(secret: string, data: string, signature: string | null | undefined): Promise<boolean> {
  if (!signature) return false;
  const expected = await hmacHex(secret, data);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

export function assertSecrets(env: { AUTH_SECRET: string; INTERNAL_SECRET: string; GATEWAY_SECRET: string }): void {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 16) {
    throw new AppError(500, 'misconfigured', 'AUTH_SECRET is not configured.');
  }
}
