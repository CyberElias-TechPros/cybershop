import { describe, it, expect, beforeAll } from 'vitest';
import { setupIntegration, api, adminLoginBody } from './harness';

/**
 * The media gateway path.
 *
 * `MEDIA_DRIVER=gateway` is what production runs: images land on the cPanel
 * host through a PHP upload script, not in D1. Only the D1 path had ever been
 * exercised, which meant the documented production path was the one thing
 * nobody had run.
 *
 * The PHP script itself is not this repo's to test, but the whole contract
 * around it is: the Worker issues a short-lived HMAC-signed token, and then
 * accepts a finalize call that must prove the token is un-forged, un-spent,
 * un-expired, owned by the caller, and describing a file that really was
 * uploaded to the path it was authorised for. Every one of those is a way this
 * goes wrong, so every one of them is tested.
 */
setupIntegration();

let adminCookie = '';
let cookie = '';
let otherCookie = '';
let businessId = 0;

async function registerVendor(suffix: string, email: string) {
  const r = await api('/api/auth/register', {
    method: 'POST',
    body: {
      role: 'vendor',
      name: `Media Vendor ${suffix}`,
      email,
      phone: '+2348035550000',
      password: 'Passw0rd123',
      business_name: `Media Store ${suffix}`,
      category_slug: 'fashion',
      whatsapp_number: '08035550000',
      city: 'Lagos',
    },
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  const c = r.cookie!;
  const intent = await api('/api/vendor/payment-intent', { method: 'POST', body: { plan_slug: 'starter', method: 'bank_transfer' }, cookie: c });
  expect(intent.status).toBe(200);
  const appr = await api(`/api/admin/payments/${intent.json.payment.id}/approve`, { method: 'POST', cookie: adminCookie });
  expect(appr.status).toBe(200);
  return c;
}

beforeAll(async () => {
  const r = await api('/api/auth/login', { method: 'POST', body: adminLoginBody() });
  expect(r.status).toBe(200);
  adminCookie = r.cookie!;
  cookie = await registerVendor('A', 'media-gw-a@test.ng');
  otherCookie = await registerVendor('B', 'media-gw-b@test.ng');
  const me = await api('/api/auth/me', { cookie });
  businessId = me.json.business.id;
}, 60000);

async function tokenFor(c = cookie) {
  const r = await api('/api/vendor/media/token', { method: 'POST', cookie: c, body: { kind: 'catalogue' } });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  return r.json as { token: string; uploadUrl: string; pathPrefix: string; maxBytes: number };
}

function finalize(body: Record<string, unknown>, c = cookie) {
  return api('/api/vendor/media/finalize', { method: 'POST', cookie: c, body });
}

describe('media gateway upload path', () => {
  it('issues a signed token scoped to one business and one folder', async () => {
    const t = await tokenFor();
    expect(t.token.split('.')).toHaveLength(2);
    expect(t.uploadUrl).toMatch(/\/upload\.php$/);
    expect(t.pathPrefix).toBe(`media/vendors/${businessId}/catalogue/`);
    expect(t.maxBytes).toBeGreaterThan(0);

    // The token has to be short-lived: it authorises a write to the host.
    const payload = JSON.parse(Buffer.from(t.token.split('.')[0]!, 'base64url').toString());
    expect(payload.b).toBe(businessId);
    expect(payload.e - Math.floor(Date.now() / 1000)).toBeGreaterThan(0);
    expect(payload.e - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(600);
  });

  it('requires a vendor session to get a token', async () => {
    expect((await api('/api/vendor/media/token', { method: 'POST', body: { kind: 'catalogue' } })).status).toBe(401);
  });

  it('completes a real upload and serves it from the media host', async () => {
    const t = await tokenFor();
    const r = await finalize({
      token: t.token,
      storage_key: `${t.pathPrefix}dress-01.jpg`,
      original_name: 'dress.jpg',
      mime: 'image/jpeg',
      size: 204800,
      width: 1200,
      height: 1600,
    });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.media.url).toMatch(/\/media\/vendors\/\d+\/catalogue\/dress-01\.jpg$/);

    // It shows up in the library as a gateway file, not a D1 blob.
    const lib = await api('/api/vendor/media', { cookie });
    const row = (lib.json.media as { id: number; driver: string }[]).find((m) => m.id === r.json.media.id);
    expect(row?.driver).toBe('gateway');
  });

  it('refuses to spend a token twice', async () => {
    const t = await tokenFor();
    const args = { token: t.token, storage_key: `${t.pathPrefix}once.jpg`, mime: 'image/jpeg', size: 1024 };
    expect((await finalize(args)).status).toBe(200);
    const replay = await finalize({ ...args, storage_key: `${t.pathPrefix}twice.jpg` });
    expect(replay.status).toBe(400);
    expect(String(replay.json.error.message)).toMatch(/expired|try again/i);
  });

  it('refuses a token with a tampered signature', async () => {
    const t = await tokenFor();
    const [payload, sig] = t.token.split('.') as [string, string];
    const forged = `${payload}.${sig.replace(/^./, (ch) => (ch === 'a' ? 'b' : 'a'))}`;
    const r = await finalize({ token: forged, storage_key: `${t.pathPrefix}x.jpg`, mime: 'image/jpeg', size: 1024 });
    expect(r.status).toBe(403);
  });

  it('refuses a token whose payload was rewritten', async () => {
    const t = await tokenFor();
    // Re-sign nothing: swap in another business's id and keep the old signature.
    const payload = JSON.parse(Buffer.from(t.token.split('.')[0]!, 'base64url').toString());
    payload.b = businessId + 999;
    const rewritten = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const r = await finalize({
      token: `${rewritten}.${t.token.split('.')[1]}`,
      storage_key: `${t.pathPrefix}x.jpg`,
      mime: 'image/jpeg',
      size: 1024,
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it('refuses a file stored outside the folder the token authorised', async () => {
    const t = await tokenFor();
    const r = await finalize({
      token: t.token,
      storage_key: `media/vendors/${businessId}/branding/elsewhere.jpg`,
      mime: 'image/jpeg',
      size: 1024,
    });
    expect(r.status).toBe(400);
  });

  it('refuses a path that climbs out of the folder', async () => {
    const t = await tokenFor();
    const r = await finalize({
      token: t.token,
      storage_key: `${t.pathPrefix}../../etc/passwd`,
      mime: 'image/jpeg',
      size: 1024,
    });
    expect(r.status).toBe(400);
  });

  it('refuses anything that is not a JPG, PNG or WEBP', async () => {
    const t = await tokenFor();
    const r = await finalize({ token: t.token, storage_key: `${t.pathPrefix}x.php`, mime: 'application/x-php', size: 1024 });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it('refuses a file larger than the plan allows', async () => {
    const t = await tokenFor();
    const r = await finalize({
      token: t.token,
      storage_key: `${t.pathPrefix}huge.jpg`,
      mime: 'image/jpeg',
      size: t.maxBytes + 1,
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it('refuses one vendor spending another vendor’s token', async () => {
    const t = await tokenFor(); // issued to vendor A
    const r = await finalize(
      { token: t.token, storage_key: `${t.pathPrefix}stolen.jpg`, mime: 'image/jpeg', size: 1024 },
      otherCookie // presented by vendor B
    );
    expect(r.status).toBe(403);
  });

  it('does not leak a token to another vendor in the first place', async () => {
    const mine = await tokenFor();
    const theirs = await tokenFor(otherCookie);
    expect(theirs.pathPrefix).not.toBe(mine.pathPrefix);
  });
});
