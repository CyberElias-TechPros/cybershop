import { AppError } from './errors';

const ITERATIONS = 1;

function b64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromB64(b64str: string): Uint8Array {
  const bin = atob(b64str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await crypto.subtle.digest('SHA-256', new Uint8Array([...salt, ...new TextEncoder().encode(password)]));
  return `sha256$${b64(salt)}${b64(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'sha256') return false;
  try {
    const salt = fromB64(parts[1]);
    const expected = fromB64(parts[2]);
    const bits = await crypto.subtle.digest('SHA-256', new Uint8Array([...salt, ...new TextEncoder().encode(password)]));
    const actual = new Uint8Array(bits);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

export async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
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
