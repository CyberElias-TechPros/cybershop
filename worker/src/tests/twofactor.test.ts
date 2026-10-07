import { describe, it, expect, beforeAll } from 'vitest';
import { setupIntegration, api, adminLoginBody } from './harness';
import { totpCode } from '../lib/totp';

/**
 * Two-factor authentication, end to end.
 *
 * The unit tests prove the arithmetic; this proves the shape of the flow that
 * matters: a password alone must not produce a working session, the code must
 * be checked before one is issued, and a recovery code must work once only.
 */
setupIntegration();

async function registerUser(email: string): Promise<string> {
  const r = await api('/api/auth/register', {
    method: 'POST',
    body: {
      role: 'buyer',
      name: 'Two Factor User',
      email,
      password: 'Passw0rd123',
    },
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  return r.cookie!;
}

describe('two-factor authentication', () => {
  let cookie = '';
  const email = 'buyer-2fa@test.ng';
  let secret = '';

  beforeAll(async () => {
    cookie = await registerUser(email);
  }, 30000);

  it('starts off', async () => {
    const r = await api('/api/auth/2fa/status', { cookie });
    expect(r.status).toBe(200);
    expect(r.json.enabled).toBe(false);
    expect(r.json.backup_codes_left).toBe(0);
  });

  it('issues a secret and an otpauth URI the app can scan', async () => {
    const r = await api('/api/auth/2fa/setup', { method: 'POST', body: {}, cookie });
    expect(r.status).toBe(200);
    secret = r.json.secret;
    expect(secret).toMatch(/^[A-Z2-7]{26,}$/);
    expect(r.json.uri).toContain(`otpauth://totp/`);
    expect(r.json.uri).toContain(`secret=${secret}`);
    expect(r.json.uri).toContain(`CyberShop%3A${encodeURIComponent(email).replace(/%40/g, '%40')}`);
    // Still off until confirmed — an unconfirmed secret locks nobody out.
    const s = await api('/api/auth/2fa/status', { cookie });
    expect(s.json.enabled).toBe(false);
  });

  it('refuses to confirm with a wrong code', async () => {
    const r = await api('/api/auth/2fa/confirm', { method: 'POST', body: { code: '000000' }, cookie });
    expect(r.status).toBe(400);
  });

  it('turns on with a real code and hands over ten recovery codes', async () => {
    const code = await totpCode(secret);
    const r = await api('/api/auth/2fa/confirm', { method: 'POST', body: { code }, cookie });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.backup_codes).toHaveLength(10);
    const s = await api('/api/auth/2fa/status', { cookie });
    expect(s.json.enabled).toBe(true);
    expect(s.json.backup_codes_left).toBe(10);
  });

  it('withholds a session until the second factor is supplied', async () => {
    const login = await api('/api/auth/login', { method: 'POST', body: { email, password: 'Passw0rd123' } });
    expect(login.status).toBe(200);
    expect(login.json.mfa_required).toBe(true);
    const halfCookie = login.cookie!;

    // The half-session must not be usable for anything.
    const me = await api('/api/auth/me', { cookie: halfCookie });
    expect(me.status).toBe(401);

    // Right code → the session becomes real.
    const ok = await api('/api/auth/login/2fa', { method: 'POST', body: { code: await totpCode(secret) }, cookie: halfCookie });
    expect(ok.status, JSON.stringify(ok.json)).toBe(200);
    const me2 = await api('/api/auth/me', { cookie: halfCookie });
    expect(me2.status).toBe(200);
    expect(me2.json.user.email).toBe(email);
  });

  it('rejects a wrong second factor', async () => {
    const login = await api('/api/auth/login', { method: 'POST', body: { email, password: 'Passw0rd123' } });
    const halfCookie = login.cookie!;
    const bad = await api('/api/auth/login/2fa', { method: 'POST', body: { code: '111111' }, cookie: halfCookie });
    expect(bad.status).toBe(401);
    expect(bad.json.error.code).toBe('invalid_code');
  });

  it('accepts a recovery code exactly once', async () => {
    // Re-enrol cleanly so the codes below are known and unused.
    await api('/api/auth/2fa/disable', { method: 'POST', body: { password: 'Passw0rd123', code: await totpCode(secret) }, cookie });
    const setup = await api('/api/auth/2fa/setup', { method: 'POST', body: {}, cookie });
    secret = setup.json.secret;
    const confirm = await api('/api/auth/2fa/confirm', { method: 'POST', body: { code: await totpCode(secret) }, cookie });
    const backup: string[] = confirm.json.backup_codes;
    expect(backup).toHaveLength(10);

    const login = await api('/api/auth/login', { method: 'POST', body: { email, password: 'Passw0rd123' } });
    const half = login.cookie!;
    const first = await api('/api/auth/login/2fa', { method: 'POST', body: { code: backup[0] }, cookie: half });
    expect(first.status, JSON.stringify(first.json)).toBe(200);
    expect((await api('/api/auth/2fa/status', { cookie: half })).json.backup_codes_left).toBe(9);

    // Same code, second time: refused.
    const login2 = await api('/api/auth/login', { method: 'POST', body: { email, password: 'Passw0rd123' } });
    const half2 = login2.cookie!;
    const replay = await api('/api/auth/login/2fa', { method: 'POST', body: { code: backup[0] }, cookie: half2 });
    expect(replay.status).toBe(401);
  });

  it('lists the devices signed in and can drop the others', async () => {
    const s = await api('/api/auth/sessions', { cookie });
    expect(s.status).toBe(200);
    expect(s.json.sessions.length).toBeGreaterThan(0);
    expect(s.json.sessions.some((x: { current: boolean }) => x.current)).toBe(true);
    // A device label is human-readable, not a raw user-agent string.
    expect(String(s.json.sessions[0].device)).toMatch(/Browser|Chrome|Firefox|Safari|Unknown device/);

    const before = s.json.sessions.length;
    const revoked = await api('/api/auth/sessions/revoke-others', { method: 'POST', body: {}, cookie });
    expect(revoked.status).toBe(200);
    expect(revoked.json.revoked).toBe(before - 1);
    const after = await api('/api/auth/sessions', { cookie });
    expect(after.json.sessions).toHaveLength(1);
    expect(after.json.sessions[0].current).toBe(true);
    // The session we just used still works.
    expect((await api('/api/auth/me', { cookie })).status).toBe(200);
  });

  it('requires the password to turn 2FA back off', async () => {
    const bad = await api('/api/auth/2fa/disable', { method: 'POST', body: { password: 'wrong-password' }, cookie });
    expect(bad.status).toBe(400);
    const s = await api('/api/auth/2fa/status', { cookie });
    expect(s.json.enabled).toBe(true);
    // Clean up so the account is usable again.
    await api('/api/auth/2fa/disable', { method: 'POST', body: { password: 'Passw0rd123', code: await totpCode(secret) }, cookie });
    expect((await api('/api/auth/2fa/status', { cookie })).json.enabled).toBe(false);
  });

  it('keeps 2FA endpoints behind authentication', async () => {
    expect((await api('/api/auth/2fa/status')).status).toBe(401);
    expect((await api('/api/auth/sessions')).status).toBe(401);
    expect((await api('/api/auth/2fa/setup', { method: 'POST', body: {} })).status).toBe(401);
  });
});
