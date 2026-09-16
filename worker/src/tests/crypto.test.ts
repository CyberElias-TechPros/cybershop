import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, passwordNeedsUpgrade, hmacHex, verifyHmac } from '../lib/crypto';

describe('password hashing (pbkdf2)', () => {
  it('hashes and verifies with the versioned pbkdf2 format', async () => {
    const hash = await hashPassword('S3cure-passphrase!');
    expect(hash.startsWith('pbkdf2$100000$')).toBe(true);
    expect(hash.split('$').length).toBe(4);
    expect(await verifyPassword('S3cure-passphrase!', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('produces a unique salt per hash', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
  });

  it('verifies the legacy 3-part sha256 format and flags it for upgrade', async () => {
    // stored via the old intended (single-digest) format
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array([...salt, ...new TextEncoder().encode('legacy-pass')]));
    const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
    const stored = `sha256$${b64(salt)}$${b64(new Uint8Array(digest))}`;
    expect(await verifyPassword('legacy-pass', stored)).toBe(true);
    expect(await verifyPassword('nope', stored)).toBe(false);
    expect(passwordNeedsUpgrade(stored)).toBe(true);
  });

  it('verifies the legacy 2-part concatenation format (the delimiter bug)', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array([...salt, ...new TextEncoder().encode('legacy-pass')]));
    const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
    const stored = `sha256$${b64(salt)}${b64(new Uint8Array(digest))}`;
    expect(await verifyPassword('legacy-pass', stored)).toBe(true);
    expect(await verifyPassword('nope', stored)).toBe(false);
  });

  it('current-format hashes do not need upgrade', async () => {
    expect(passwordNeedsUpgrade(await hashPassword('x'))).toBe(false);
  });

  it('rejects malformed stored hashes without throwing', async () => {
    expect(await verifyPassword('x', '')).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
    expect(await verifyPassword('x', 'pbkdf2$abc$zz$zz')).toBe(false);
  });
});

describe('hmac', () => {
  it('signs and verifies', async () => {
    const sig = await hmacHex('secret', 'payload');
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    expect(await verifyHmac('secret', 'payload', sig)).toBe(true);
    expect(await verifyHmac('other', 'payload', sig)).toBe(false);
    expect(await verifyHmac('secret', 'payload2', sig)).toBe(false);
    expect(await verifyHmac('secret', 'payload', null)).toBe(false);
  });
});
