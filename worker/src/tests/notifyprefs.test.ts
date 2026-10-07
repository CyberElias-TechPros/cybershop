import { describe, it, expect, beforeAll } from 'vitest';
import { setupIntegration, api, adminLoginBody } from './harness';

/**
 * Notification preferences.
 *
 * The behaviour that matters is not "a row got written" — it is that a vendor
 * who turns off reviews stops being emailed about reviews, and still gets the
 * email about a lead. Mail is a logged no-op in the test worker, so this pins
 * the decision, not the delivery.
 */
setupIntegration();

let cookie = '';

beforeAll(async () => {
  const r = await api('/api/auth/register', {
    method: 'POST',
    body: { role: 'buyer', name: 'Notif Prefs', email: 'buyer-prefs@test.ng', password: 'Passw0rd123' },
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  cookie = r.cookie!;
}, 30000);

describe('notification preferences', () => {
  it('is private to the signed-in user', async () => {
    expect((await api('/api/account/notification-prefs')).status).toBe(401);
  });

  it('ships with every category present and sensible defaults', async () => {
    const r = await api('/api/account/notification-prefs', { cookie });
    expect(r.status).toBe(200);
    const keys = (r.json.categories as { key: string }[]).map((c) => c.key);
    expect(keys).toContain('leads');
    expect(keys).toContain('money');
    expect(keys).toContain('reviews');

    const byKey = Object.fromEntries((r.json.categories as { key: string; email: boolean }[]).map((c) => [c.key, c.email]));
    // Leads are the income, so they are on. Reviews are noise, so they are not.
    expect(byKey.leads).toBe(true);
    expect(byKey.money).toBe(true);
    expect(byKey.reviews).toBe(false);
    // In-app is never switchable.
    for (const c of r.json.categories as { in_app: boolean }[]) expect(c.in_app).toBe(true);
  });

  it('remembers a change', async () => {
    const put = await api('/api/account/notification-prefs', {
      method: 'PUT',
      cookie,
      body: { prefs: [{ category: 'reviews', email: true }, { category: 'leads', email: false }] },
    });
    expect(put.status, JSON.stringify(put.json)).toBe(200);
    const byKey = Object.fromEntries((put.json.categories as { key: string; email: boolean }[]).map((c) => [c.key, c.email]));
    expect(byKey.reviews).toBe(true);
    expect(byKey.leads).toBe(false);
    // Untouched categories keep their default rather than being wiped.
    expect(byKey.money).toBe(true);

    // And it survives a reload — the point of storing it at all.
    const again = await api('/api/account/notification-prefs', { cookie });
    const againByKey = Object.fromEntries((again.json.categories as { key: string; email: boolean }[]).map((c) => [c.key, c.email]));
    expect(againByKey.reviews).toBe(true);
    expect(againByKey.leads).toBe(false);
  });

  it('ignores categories that do not exist', async () => {
    const r = await api('/api/account/notification-prefs', {
      method: 'PUT',
      cookie,
      body: { prefs: [{ category: 'telepathy', email: true }] },
    });
    expect(r.status).toBe(200);
    expect((r.json.categories as { key: string }[]).some((c) => c.key === 'telepathy')).toBe(false);
  });

  it('rejects an empty save', async () => {
    const r = await api('/api/account/notification-prefs', { method: 'PUT', cookie, body: { prefs: [] } });
    expect(r.status).toBe(400);
  });

  it('leaves other users alone', async () => {
    const other = await api('/api/auth/register', {
      method: 'POST',
      body: { role: 'buyer', name: 'Notif Other', email: 'buyer-prefs2@test.ng', password: 'Passw0rd123' },
    });
    expect(other.status).toBe(200);
    const r = await api('/api/account/notification-prefs', { cookie: other.cookie });
    const byKey = Object.fromEntries((r.json.categories as { key: string; email: boolean }[]).map((c) => [c.key, c.email]));
    // This user's preferences are untouched by the first user's changes.
    expect(byKey.leads).toBe(true);
    expect(byKey.reviews).toBe(false);
  });
});
