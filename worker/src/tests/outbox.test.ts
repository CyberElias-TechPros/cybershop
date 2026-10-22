import { describe, expect, it } from 'vitest';
import { api, setupIntegration, adminLoginBody } from './harness';

setupIntegration({ main: 'src/tests/fixtures/operations-worker.ts' });
const message = { to: 'private-recipient@test.ng', subject: 'Private reset', text: 'reset-token-never-in-metadata', html: '<p>private</p>' };
const call = async (path: string, body: unknown) => {
  const r = await api(`/__test/${path}`, { method: 'POST', body });
  expect(r.status, r.text).toBe(200);
  return r.json;
};
const enqueue = async (options = {}) => (await call('enqueue', { message, options })).id as string;
const row = (id: string) => call('row', { id });
const patch = (id: string, patch: unknown) => call('patch', { id, patch });
const dispatch = (id: string, rest = {}) => call('dispatch', { id, ...rest });

describe('durable email on real D1 / Workers crypto', () => {
  it('encrypts recipients, bodies and tokens, and binds ciphertext to intent ID', async () => {
    const id = await enqueue();
    const record = await row(id);
    expect(JSON.stringify(record)).not.toContain(message.to);
    expect(JSON.stringify(record)).not.toContain(message.text);
    expect(await call('open', { id })).toEqual(message);
    const swapped = await enqueue();
    await patch(swapped, { payload: record.payload });
    expect((await dispatch(swapped)).calls).toHaveLength(0);
    expect((await row(swapped)).last_error).toBe('payload_invalid');
  });
  it('deduplicates durable enqueue and concurrent dispatch', async () => {
    const ids = await Promise.all([enqueue({ idempotencyKey: 'same-intent' }), enqueue({ idempotencyKey: 'same-intent' })]);
    expect(ids[0]).toBe(ids[1]);
    const results = await Promise.all([dispatch(ids[0], { delay: 100 }), dispatch(ids[0], { delay: 100 })]);
    expect(results.reduce((n, r) => n + r.calls.length, 0)).toBe(1);
    expect((await row(ids[0])).status).toBe('sent');
    expect((await row(ids[0])).payload).toBeNull();
    expect((await dispatch(ids[0])).calls).toHaveLength(0);
    expect(await enqueue({ idempotencyKey: 'same-intent' })).toBe(ids[0]);
  });
  it('retries transient errors with the same provider key, no provider body retained', async () => {
    const id = await enqueue();
    const first = await dispatch(id, { status: 503 });
    expect(first.failed).toBe(1);
    let record = await row(id);
    expect(record.status).toBe('queued');
    expect(record.available_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(JSON.stringify(record)).not.toContain('PRIVATE PROVIDER BODY');
    expect((await dispatch(id)).calls).toHaveLength(0);
    await patch(id, { available_at: 0 });
    const second = await dispatch(id);
    expect(second.sent).toBe(1);
    expect(second.calls[0].key).toBe(first.calls[0].key);
    record = await row(id);
    expect(record.attempts).toBe(2);
  });
  it.each([408, 409, 429, 500])('retries provider HTTP %i', async (status) => {
    const id = await enqueue();
    await dispatch(id, { status });
    expect((await row(id)).status).toBe('queued');
  });
  it('retries network failures without serializing sensitive error messages', async () => {
    const id = await enqueue();
    await dispatch(id, { networkError: true });
    const record = await row(id);
    expect(record.status).toBe('queued');
    expect(record.last_error).toBe('provider_unavailable');
  });
  it('dead-letters permanent errors; replay keeps identity and original expiry', async () => {
    const id = await enqueue();
    await dispatch(id, { status: 422 });
    const before = await row(id);
    expect(before.status).toBe('dead');
    expect((await dispatch(id)).calls).toHaveLength(0);
    expect((await call('replay', { id })).ok).toBe(true);
    expect((await row(id)).expires_at).toBe(before.expires_at);
    expect((await dispatch(id)).sent).toBe(1);
    expect((await call('replay', { id })).ok).toBe(false);
  });
  it('reclaims an abandoned lease; fences the old owner; bounds retries', async () => {
    const id = await enqueue();
    await patch(id, { status: 'processing', lock_token: 'old-owner', locked_until: Math.floor(Date.now() / 1000) + 300 });
    expect((await dispatch(id)).calls).toHaveLength(0);
    await patch(id, { locked_until: 0, attempts: 7 });
    await dispatch(id, { status: 503 });
    expect((await row(id)).status).toBe('dead');
    const crashed = await enqueue();
    await patch(crashed, { status: 'processing', lock_token: 'crashed', locked_until: 0, attempts: 8 });
    expect((await dispatch(crashed)).calls).toHaveLength(0);
    expect((await row(crashed)).last_error).toBe('attempts_exhausted');
  });
  it('expires security mail, erases ciphertext and refuses replay', async () => {
    const id = await enqueue({ expiresInSeconds: 3600 });
    await patch(id, { expires_at: 0 });
    expect((await dispatch(id)).calls).toHaveLength(0);
    expect((await row(id)).status).toBe('cancelled');
    expect((await row(id)).payload).toBeNull();
    expect((await call('replay', { id })).ok).toBe(false);
  });
  it('rechecks preferences, changed email and deleted accounts at delivery', async () => {
    const registration = await api('/api/auth/register', { method: 'POST', body: { role: 'buyer', name: 'Private Recipient', email: message.to, password: 'Passw0rd123' } });
    expect(registration.status).toBe(200);
    const userId = registration.json.user.id;
    const cookie = registration.cookie!;
    const id = await enqueue({ userId, notificationType: 'payment.approved' });
    const prefs = await api('/api/account/notification-prefs', { method: 'PUT', cookie, body: { prefs: [{ category: 'money', email: false }] } });
    expect(prefs.status, prefs.text).toBe(200);
    expect((await dispatch(id)).calls).toHaveLength(0);
    expect((await row(id)).status).toBe('cancelled');
    const changed = await enqueue({ userId });
    await call('user-patch', { id: userId, email: 'new-recipient@test.ng' });
    expect((await dispatch(changed)).cancelled).toBe(1);
    await call('user-patch', { id: userId, email: message.to });
    const deleted = await enqueue({ userId });
    await call('user-patch', { id: userId, deleted_at: new Date().toISOString() });
    expect((await dispatch(deleted)).cancelled).toBe(1);
  });
  it('exposes only non-sensitive metadata to admins and rejects unauthorized replay', async () => {
    const id = await enqueue();
    await dispatch(id, { status: 422 });
    expect((await api(`/api/admin/mail/${id}/replay`, { method: 'POST', body: {} })).status).toBe(401);
    const login = await api('/api/auth/login', { method: 'POST', body: adminLoginBody() });
    const health = await api('/api/admin/health', { cookie: login.cookie });
    expect(health.status, health.text).toBe(200);
    expect(health.json.mail.recent.length).toBeGreaterThan(0);
    expect(JSON.stringify(health.json.mail)).not.toContain(message.to);
    for (const item of health.json.mail.recent) expect(item).not.toHaveProperty('payload');
    expect((await api(`/api/admin/mail/${id}/replay`, { method: 'POST', body: {}, cookie: login.cookie })).status).toBe(200);
    expect((await api(`/api/admin/mail/${id}/replay`, { method: 'POST', body: {}, cookie: login.cookie })).status).toBe(409);
  });
});

describe('shared operations leases', () => {
  it('allows one concurrent owner and fences stale release', async () => {
    const results = await Promise.all([call('lease', { name: 'concurrent', ttl: 60 }), call('lease', { name: 'concurrent', ttl: 60 })]);
    expect(results.filter((r) => r.owner)).toHaveLength(1);
    const owner = results.find((r) => r.owner).owner;
    expect((await call('release', { name: 'concurrent', owner: 'wrong' })).ok).toBe(false);
    expect((await call('lease', { name: 'concurrent', ttl: 60 })).owner).toBeNull();
    await call('lease-expire', { name: 'concurrent' });
    const next = (await call('lease', { name: 'concurrent', ttl: 60 })).owner;
    expect(next).toBeTruthy();
    expect((await call('release', { name: 'concurrent', owner })).ok).toBe(false);
    expect((await call('release', { name: 'concurrent', owner: next })).ok).toBe(true);
  });
  it('skips overlapping hourly work and records completed/failed runs durably', async () => {
    const owner = (await call('lease', { name: 'hourly', ttl: 60 })).owner;
    const skipped = await call('hourly', {});
    expect(skipped.summary.skipped_overlap).toBe(1);
    await call('release', { name: 'hourly', owner });
    expect((await call('hourly', {})).summary).toBeDefined();
    expect((await call('hourly', { fail: true })).failed).toBe(true);
    // Failure released the shared lease, so retry is possible.
    expect((await call('hourly', {})).summary.skipped_overlap).toBeUndefined();
    const login = await api('/api/auth/login', { method: 'POST', body: adminLoginBody() });
    const health = await api('/api/admin/health', { cookie: login.cookie });
    const jobs = health.json.jobs as { status: string; started_at: number; finished_at: number }[];
    expect(jobs.filter((job) => job.status === 'completed')).toHaveLength(2);
    expect(jobs.filter((job) => job.status === 'failed')).toHaveLength(1);
    expect(jobs.every((job) => job.finished_at >= job.started_at)).toBe(true);
    expect(JSON.stringify(jobs)).not.toContain('Sensitive test failure');
  });

});
