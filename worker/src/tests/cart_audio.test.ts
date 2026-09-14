import { describe, it, expect } from 'vitest';
import { setupIntegration, api, BASE_URL } from './harness';

setupIntegration();

async function registerVendor(suffix: string) {
  const email = `vendor-ca-${suffix}@test.ng`;
  let r = await api('/api/auth/register', {
    method: 'POST',
    body: {
      role: 'vendor', name: `Vendor CA ${suffix}`, email, phone: '+2348031111111', password: 'Passw0rd123',
      business_name: `CA Store ${suffix}`, category_slug: 'fashion', whatsapp_number: '08031111111', city: 'Lagos',
    },
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  const cookie = r.cookie!;
  r = await api('/api/vendor/payment-intent', { method: 'POST', body: { plan_slug: 'free', method: 'bank_transfer' }, cookie });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  const me = await api('/api/auth/me', { cookie });
  return { cookie, businessId: me.json.business.id, businessSlug: me.json.business.slug };
}

async function createItem(cookie: string, name: string, priceKobo: number) {
  const r = await api('/api/vendor/items', {
    method: 'POST', cookie,
    body: {
      name, item_type_slug: 'product', category_slug: 'fashion',
      price_kobo: priceKobo, price_type: 'fixed', publish: true,
      stock_status: 'in_stock',
    },
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  return r.json as { id: number; slug: string };
}

/** Tiny file with a valid MP3 ID3 header (magic-byte detection only). */
function mp3File(name = 'voice-note.mp3'): File {
  const b = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  return new File([b], name, { type: 'audio/mpeg' });
}

/** JPEG bytes with an .mp3 name — must be rejected by magic-byte validation. */
function fakeMp3(): File {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
  return new File([jpeg], 'evil.mp3', { type: 'audio/mpeg' });
}

function messageFrom(waUrl: string): string {
  return decodeURIComponent(new URL(waUrl).searchParams.get('text') ?? '');
}

describe('WhatsApp cart (multi-item inquiries, plan §30)', () => {
  it('composes a multi-item message with per-line prices and an estimated total', async () => {
    const { cookie, businessId } = await registerVendor('cart1');
    const a = await createItem(cookie, 'HP Laptop', 10000000); // ₦100,000
    const b = await createItem(cookie, 'Wireless Mouse', 2500000); // ₦25,000

    const r = await api('/api/public/inquiries', {
      method: 'POST',
      body: { business_id: businessId, items: [{ listing_id: a.id, quantity: 2 }, { listing_id: b.id, quantity: 1 }] },
    });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const msg = messageFrom(r.json.wa_url);
    expect(msg).toContain('1. HP Laptop × 2 — ₦100,000');
    expect(msg).toContain('2. Wireless Mouse × 1 — ₦25,000');
    expect(msg).toContain('Estimated total: ₦225,000');
    expect(msg).toContain('Please confirm availability and final price.');
  });

  it('marks the lead with source=cart and the stored items_json', async () => {
    const { cookie, businessId } = await registerVendor('cart2');
    const a = await createItem(cookie, 'Ankara Dress', 4500000);
    const b = await createItem(cookie, 'Beach Bag', 1200000);
    const r = await api('/api/public/inquiries', {
      method: 'POST',
      body: {
        business_id: businessId,
        name: 'Kemi Ade',
        note: 'Pickup in Ikeja tomorrow',
        items: [{ listing_id: a.id, quantity: 1 }, { listing_id: b.id, quantity: 3 }],
      },
    });
    expect(r.status).toBe(200);
    const msg = messageFrom(r.json.wa_url);
    expect(msg).toContain("I'm Kemi Ade");
    expect(msg).toContain('Note: Pickup in Ikeja tomorrow');
    const list = await api('/api/vendor/inquiries', { cookie });
    expect(list.status).toBe(200);
    const lead = list.json.inquiries[0];
    expect(lead.source).toBe('cart');
    expect(lead.buyer_name).toBe('Kemi Ade');
    const items = Array.isArray(lead.items) ? lead.items : JSON.parse(lead.items_json);
    expect(items.map((i: { listing_id: number; quantity: number }) => [i.listing_id, i.quantity]).sort()).toEqual(
      [[a.id, 1], [b.id, 3]].sort()
    );
    const notes = await api('/api/vendor/notifications', { cookie });
    expect(notes.status).toBe(200);
    const titles = (notes.json.notifications as { title: string }[]).map((n) => n.title);
    expect(titles.some((t) => t.includes('Kemi Ade'))).toBe(true);
  });

  it('rejects another vendor\'s items (IDOR) and empty carts', async () => {
    const v1 = await registerVendor('cart3a');
    const v2 = await registerVendor('cart3b');
    const foreign = await createItem(v2.cookie, 'Foreign Item', 1000000);
    const own = await createItem(v1.cookie, 'Own Item', 1000000);

    // v1's cart containing v2's item → only the own item survives
    const r = await api('/api/public/inquiries', {
      method: 'POST',
      body: { business_id: v1.businessId, items: [{ listing_id: foreign.id, quantity: 1 }, { listing_id: own.id, quantity: 1 }] },
    });
    expect(r.status).toBe(200);
    const msg = messageFrom(r.json.wa_url);
    expect(msg).not.toContain('Foreign Item');
    expect(msg).toContain('Own Item');

    // all-foreign cart → 404 (nothing of theirs to enquire about)
    const r2 = await api('/api/public/inquiries', {
      method: 'POST',
      body: { business_id: v1.businessId, items: [{ listing_id: foreign.id, quantity: 1 }] },
    });
    expect(r2.status).toBe(404);

    // empty cart → 400
    const r3 = await api('/api/public/inquiries', {
      method: 'POST',
      body: { business_id: v1.businessId, items: [] },
    });
    expect(r3.status).toBe(400);
  });
});

describe('voice notes on items', () => {
  it('uploads real audio, rejects disguised files', async () => {
    const { cookie } = await registerVendor('audio1');

    const gform = new FormData();
    gform.append('file', mp3File());
    const good = await api('/api/vendor/media/upload-audio', { method: 'POST', cookie, form: gform });
    expect(good.status, JSON.stringify(good.json)).toBe(200);
    expect(good.json.media.kind).toBe('audio');
    expect(String(good.json.media.url)).toContain('/api/media/file/');
    // served bytes must be the exact file (RIFF magic), not a stringified blob
    const served = await fetch(`${BASE_URL}/api/media/file/${good.json.media.id}`);
    const sbytes = new Uint8Array(await served.arrayBuffer());
    expect(Array.from(sbytes.slice(0, 4))).toEqual([0x49, 0x44, 0x33, 0x04]); // ID3 (as uploaded)

    const bform = new FormData();
    bform.append('file', fakeMp3());
    const bad = await api('/api/vendor/media/upload-audio', { method: 'POST', cookie, form: bform });
    expect(bad.status).toBeGreaterThanOrEqual(400);
  });

  it('attaches to an item, surfaces it publicly, clears on null, ignores foreign ids', async () => {
    const v1 = await registerVendor('audio2a');
    const v2 = await registerVendor('audio2b');
    const item = await createItem(v1.cookie, 'Course with Voice', 5000000);

    const uform = new FormData();
    uform.append('file', mp3File('course.mp3'));
    const up = await api('/api/vendor/media/upload-audio', { method: 'POST', cookie: v1.cookie, form: uform });
    const audioId = up.json.media.id;
    const audioUrl = up.json.media.url;

    // attach (full payload — PUT contract)
    let r = await api(`/api/vendor/items/${item.id}`, {
      method: 'PUT', cookie: v1.cookie,
      body: {
        name: 'Course with Voice', item_type_slug: 'product', category_slug: 'fashion',
        price_kobo: 5000000, price_type: 'fixed', publish: true, stock_status: 'in_stock',
        audio_media_id: audioId,
      },
    });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    let pub = await api(`/api/public/item?biz=${v1.businessSlug}&segment=products&slug=${item.slug}`);
    expect(pub.status).toBe(200);
    expect(pub.json.item.audio.url).toBe(audioUrl);

    // v2 tries to attach v1's audio to v2's item → rejected (IDOR, same
    // ownership guard as image media). v1's item must be untouched.
    const foreign = await createItem(v2.cookie, 'Foreign Course', 1000000);
    r = await api(`/api/vendor/items/${foreign.id}`, {
      method: 'PUT', cookie: v2.cookie,
      body: {
        name: 'Foreign Course', item_type_slug: 'product', category_slug: 'fashion',
        price_kobo: 1000000, price_type: 'fixed', publish: true, stock_status: 'in_stock',
        audio_media_id: audioId,
      },
    });
    expect(r.status).toBe(404);
    pub = await api(`/api/public/item?biz=${v2.businessSlug}&segment=products&slug=${foreign.slug}`);
    expect(pub.json.item.audio).toBeNull();
    // and v1's attachment survived the attempt
    pub = await api(`/api/public/item?biz=${v1.businessSlug}&segment=products&slug=${item.slug}`);
    expect(pub.json.item.audio.url).toBe(audioUrl);

    // null clears
    r = await api(`/api/vendor/items/${item.id}`, {
      method: 'PUT', cookie: v1.cookie,
      body: {
        name: 'Course with Voice', item_type_slug: 'product', category_slug: 'fashion',
        price_kobo: 5000000, price_type: 'fixed', publish: true, stock_status: 'in_stock',
        audio_media_id: null,
      },
    });
    expect(r.status).toBe(200);
    pub = await api(`/api/public/item?biz=${v1.businessSlug}&segment=products&slug=${item.slug}`);
    expect(pub.json.item.audio).toBeNull();
  });
});
