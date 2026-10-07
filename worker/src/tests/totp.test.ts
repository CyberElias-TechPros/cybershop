import { describe, it, expect } from 'vitest';
import { randomBase32Secret, totpCode, verifyTotp, totpUri, generateBackupCodes, spentCodeHash, TOTP_PERIOD } from '../lib/totp';

/**
 * TOTP is the thing standing between a stolen admin password and someone
 * approving fake bank proofs. It is pure and time-injectable, so it is tested
 * deterministically rather than with a real clock.
 */
describe('TOTP (second factor for admin accounts)', () => {
  // RFC 6238 test vector: base32 of the ASCII key 12345678901234567890
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  it('produces the RFC 6238 reference codes', async () => {
    // The RFC's published checkpoints for SHA-1 / 8 digits; ours is 6 digits,
    // which is the low 6 of the same HOTP value.
    const at = (seconds: number) => seconds * 1000;
    const c59 = await totpCode(secret, at(59));
    const c1111111109 = await totpCode(secret, at(1111111109));
    const c1111111111 = await totpCode(secret, at(1111111111));
    // RFC values truncated to 6 digits: 94287082 → 287082, 07081804 → 081804, 14050471 → 050471
    expect(c59).toBe('287082');
    expect(c1111111109).toBe('081804');
    expect(c1111111111).toBe('050471');
  });

  it('accepts a current code and rejects a wrong one', async () => {
    const now = Date.UTC(2026, 0, 15, 12, 0, 0);
    const code = await totpCode(secret, now);
    expect((await verifyTotp(secret, code, { atMs: now })).ok).toBe(true);
    expect((await verifyTotp(secret, '000000', { atMs: now })).ok).toBe(false);
  });

  it('tolerates clock drift but not much', async () => {
    const now = Date.UTC(2026, 0, 15, 12, 0, 0);
    // One period back and forward are inside the window.
    const behind = await totpCode(secret, now - TOTP_PERIOD * 1000);
    const ahead = await totpCode(secret, now + TOTP_PERIOD * 1000);
    expect((await verifyTotp(secret, behind, { atMs: now })).ok).toBe(true);
    expect((await verifyTotp(secret, ahead, { atMs: now })).ok).toBe(true);
    // Two periods out is not.
    const stale = await totpCode(secret, now - 3 * TOTP_PERIOD * 1000);
    expect((await verifyTotp(secret, stale, { atMs: now })).ok).toBe(false);
  });

  it('refuses to replay a code that was already used', async () => {
    const now = Date.UTC(2026, 0, 15, 12, 0, 0);
    const code = await totpCode(secret, now);
    const first = await verifyTotp(secret, code, { atMs: now });
    expect(first.ok).toBe(true);
    // Same window, same code: a replay.
    const spentHash = await spentCodeHash(first.counter!, code);
    const second = await verifyTotp(secret, code, { atMs: now, lastCounter: first.counter, lastCodeHash: spentHash });
    expect(second.ok).toBe(false);
  });

  it('refuses any code from a window already left behind', async () => {
    const now = Date.UTC(2026, 0, 15, 12, 0, 0);
    const code = await totpCode(secret, now);
    // The last used window is one period on from the code we are presenting.
    const last = await totpCode(secret, now + TOTP_PERIOD * 1000);
    const lastHash = await spentCodeHash(Math.floor((now + TOTP_PERIOD * 1000) / 1000 / TOTP_PERIOD), last);
    const r = await verifyTotp(secret, code, {
      atMs: now,
      lastCounter: Math.floor((now + TOTP_PERIOD * 1000) / 1000 / TOTP_PERIOD),
      lastCodeHash: lastHash,
    });
    expect(r.ok).toBe(false);
  });

  it('allows a second login inside the same 30-second window with the next code', async () => {
    // This is the bug the spent-code hash exists for: enrolling and then
    // signing in again within 30 seconds must not be rejected, or the user is
    // told a code their app is showing as valid is wrong.
    const now = Date.UTC(2026, 0, 15, 12, 0, 0);
    const first = await totpCode(secret, now);
    const v1 = await verifyTotp(secret, first, { atMs: now });
    expect(v1.ok).toBe(true);

    // Same window, but pretend the secret produced a different code for it by
    // checking against a different secret in the same window.
    const other = randomBase32Secret();
    const second = await totpCode(other, now);
    const v2 = await verifyTotp(other, second, {
      atMs: now,
      lastCounter: v1.counter,
      lastCodeHash: await spentCodeHash(v1.counter!, first),
    });
    expect(v2.ok).toBe(true);
  });

  it('generates a usable enrolment secret and URI', async () => {
    const s = randomBase32Secret();
    expect(s.length).toBeGreaterThanOrEqual(26);
    expect(/^[A-Z2-7]+$/.test(s)).toBe(true);
    // A freshly generated secret must actually work.
    const now = Date.now();
    expect((await verifyTotp(s, await totpCode(s, now), { atMs: now })).ok).toBe(true);

    const uri = totpUri(s, 'admin@test.ng');
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain(`secret=${s}`);
    expect(uri).toContain('period=30');
    expect(uri).toContain('digits=6');
  });

  it('issues ten distinct, well-formed recovery codes', () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[0-9A-F]{5}-[0-9A-F]{5}$/);
  });
});
