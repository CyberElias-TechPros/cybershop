/**
 * TOTP (RFC 6238) — the second factor for accounts that can move money.
 *
 * An admin on this platform approves bank transfers, verifies ID documents,
 * suspends stores and grants plans. A password alone is not enough for that.
 *
 * Implemented here rather than pulled from a package: it is ~60 lines of
 * HMAC-SHA1, Workers already have Web Crypto, and an authenticator app on the
 * other side is standard (Google Authenticator, Authy, 1Password, Apple
 * Passwords all speak TOTP). The whole module is pure and time-injectable so it
 * can be tested deterministically.
 */

import { sha256Hex } from './util';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // RFC 4648 base32
export const TOTP_PERIOD = 30; // seconds
export const TOTP_DIGITS = 6;

export function randomBase32Secret(bytes = 20): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of b) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(secret: string): Uint8Array {
  const clean = secret.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32 character in TOTP secret.');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

function counterAt(timeMs: number): number {
  return Math.floor(timeMs / 1000 / TOTP_PERIOD);
}

async function hotp(secret: string, counter: number): Promise<string> {
  // 8-byte big-endian counter, as RFC 4226 requires.
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, Math.floor(counter / 0x1_0000_0000));
  view.setUint32(4, counter >>> 0);
  const key = await crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
  const offset = sig[sig.length - 1]! & 0x0f;
  const bin =
    ((sig[offset]! & 0x7f) << 24) | ((sig[offset + 1]! & 0xff) << 16) | ((sig[offset + 2]! & 0xff) << 8) | (sig[offset + 3]! & 0xff);
  return String(bin % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/** The code currently showing in the authenticator app. */
export async function totpCode(secret: string, atMs: number = Date.now()): Promise<string> {
  return hotp(secret, counterAt(atMs));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface TotpVerifyResult {
  ok: boolean;
  /** The counter that matched, so callers can store it and refuse replays. */
  counter: number | null;
}

/**
 * Hash of a spent code. Stored so the guard below can tell "same window, same
 * code" (a replay — refuse) from "same window, next code" (a legitimate second
 * login inside 30 seconds — allow).
 */
export async function spentCodeHash(counter: number, code: string): Promise<string> {
  return sha256Hex(`totp:${counter}:${code}`);
}

/**
 * Verify a code, allowing one step either side for clock drift.
 *
 * Replay rule: a counter behind the last one used is always refused. The *same*
 * counter is refused only when the code is also identical — otherwise enrolling
 * and then signing in again inside the same 30-second window would reject a
 * code the app is showing as valid.
 */
export async function verifyTotp(
  secret: string,
  code: string,
  opts: { atMs?: number; window?: number; lastCounter?: number | null; lastCodeHash?: string | null } = {}
): Promise<TotpVerifyResult> {
  const at = opts.atMs ?? Date.now();
  const window = opts.window ?? 1;
  const given = String(code || '').replace(/\D/g, '');
  if (given.length !== TOTP_DIGITS) return { ok: false, counter: null };

  const base = counterAt(at);
  for (let d = -window; d <= window; d++) {
    const counter = base + d;
    if (opts.lastCounter) {
      if (counter < opts.lastCounter) continue; // behind the last window used
      if (counter === opts.lastCounter) {
        const hash = await spentCodeHash(counter, given);
        if (opts.lastCodeHash && safeEqual(hash, opts.lastCodeHash)) continue; // replayed
      }
    }
    if (safeEqual(await hotp(secret, counter), given)) return { ok: true, counter };
  }
  return { ok: false, counter: null };
}

/** The otpauth:// URI shown as a QR code during enrolment. */
export function totpUri(secret: string, account: string, issuer = 'CyberShop'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Ten single-use recovery codes. Shown once, stored hashed. */
export function generateBackupCodes(count = 10): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const b = crypto.getRandomValues(new Uint8Array(5));
    const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
    out.push(`${hex.slice(0, 5)}-${hex.slice(5)}`);
  }
  return out;
}
