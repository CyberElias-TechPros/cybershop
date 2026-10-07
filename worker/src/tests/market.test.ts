import { describe, it, expect } from 'vitest';
import { setupIntegration, api } from './harness';

setupIntegration();

async function registerVendor(suffix: string, city = 'Lagos') {
  const email = `vendor-mk-${suffix}@test.ng`;
  let r = await api('/api/auth/register', {
    method: 'POST',
    body: {
      role: 'vendor', name: `Vendor MK ${suffix}`, email, phone: '+2348031111111', password: 'Passw0rd123',
      business_name: `MK Store ${suffix}`, category_slug: 'fashion', whatsapp_number: '08031111111', city,
    },
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  const cookie = r.cookie!;
  r = await api('/api/vendor/payment-intent', { method: 'POST', body: { plan_slug: 'free', method: 'bank_transfer' }, cookie });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  const me = await api('/api/auth/me', { cookie });
  return { cookie, businessId: me.json.business.id as number, businessSlug: me.json.business.slug as string };
}

async function createItem(cookie: string, name: string, priceKobo: number) {
  const r = await api('/api/vendor/items', {
    method: 'POST', cookie,
    body: {
      name, item_type_slug: 'product', category_slug: 'fashion',
      price_kobo: priceKobo, price_type: 'fixed', publish: true, stock_status: 'in_stock',
    },
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  return r.json as { id: number; slug: string };
}

describe('classifieds feed + reports (Jiji-style, no checkout)', () => {
  it('lists published ads, filters by city and price, and exposes seller tenure', async () => {
    const lagos = await registerVendor('lag', 'Lagos');
    const abj = await registerVendor('abj', 'Abuja');
    const cheap = await createItem(lagos.cookie, 'Ankara Shirt', 500000);
    await createItem(lagos.cookie, 'Gold Hoops', 8000000);
    await createItem(abj.cookie, 'Abuja Gown', 2500000);

    const all = await api('/api/public/listings');
    expect(all.status).toBe(200);
    const names = (all.json.items as { name: string }[]).map((i) => i.name);
    expect(names).toContain('Ankara Shirt');
    expect(names).toContain('Abuja Gown');

    const city = await api('/api/public/listings?city=Abuja');
    const cityNames = (city.json.items as { name: string; city: string }[]).map((i) => i.name);
    expect(cityNames).toEqual(['Abuja Gown']);

    const cheapOnly = await api('/api/public/listings?max_price=600000');
    const cheapNames = (cheapOnly.json.items as { name: string }[]).map((i) => i.name);
    expect(cheapNames).toContain('Ankara Shirt');
    expect(cheapNames).not.toContain('Gold Hoops');

    const cities = await api('/api/public/cities');
    expect(cities.status).toBe(200);
    expect((cities.json.cities as { city: string }[]).some((c) => c.city === 'Lagos')).toBe(true);

    const item = await api(`/api/public/item?biz=${lagos.businessSlug}&segment=products&slug=${cheap.slug}`);
    expect(item.status).toBe(200);
    expect(item.json.business.listing_count).toBeGreaterThanOrEqual(2);
    expect(item.json.item.views).toBeGreaterThanOrEqual(1);
    expect(item.json.business.created_at).toBeTruthy();
  });

  it('finds things however the buyer words it', async () => {
    // The three failures of a plain LIKE '%q%': word order, plurals, and the
    // right result buried under loose ones.
    const v = await registerVendor('srch', 'Lagos');
    await createItem(v.cookie, 'Ankara Gown', 1500000);
    await createItem(v.cookie, 'Leather Bag', 900000);

    const nameOf = (r: { json: any }) => (r.json.items as { name: string }[]).map((i) => i.name);

    // 1. Words in the buyer's order, not the seller's.
    const reversed = await api('/api/public/search?q=gown%20ankara');
    expect(reversed.status).toBe(200);
    expect(nameOf(reversed)).toContain('Ankara Gown');

    // 2. A plural finds the singular (and vice versa).
    const plural = await api('/api/public/search?q=gowns');
    expect(nameOf(plural)).toContain('Ankara Gown');
    const singular = await api('/api/public/search?q=bags');
    expect(nameOf(singular)).toContain('Leather Bag');

    // 3. It does not simply return everything.
    const bagOnly = await api('/api/public/search?q=leather');
    expect(nameOf(bagOnly)).toContain('Leather Bag');
    expect(nameOf(bagOnly)).not.toContain('Ankara Gown');

    // 4. The item that leads with the word outranks one that mentions it in
    //    passing — otherwise the exact match is buried under loose ones.
    await createItem(v.cookie, 'Gift box with a gown inside', 400000);
    const ranked = nameOf(await api('/api/public/search?q=gown'));
    expect(ranked.indexOf('Ankara Gown')).toBeGreaterThanOrEqual(0);
    expect(ranked.indexOf('Ankara Gown')).toBeLessThan(ranked.indexOf('Gift box with a gown inside'));

    // 5. Stopwords do not empty the result set.
    const stop = await api('/api/public/search?q=the%20gown');
    expect(nameOf(stop)).toContain('Ankara Gown');

    // 6. Nonsense returns nothing rather than everything.
    const none = await api('/api/public/search?q=zzzzzqqqq');
    expect(none.status).toBe(200);
    expect(nameOf(none)).toEqual([]);
    expect(Array.isArray(none.json.suggestions)).toBe(true);

    // 7. Too short a query is a no-op, not a table scan.
    const tiny = await api('/api/public/search?q=a');
    expect(tiny.json.total).toBe(0);
  });

  it('accepts a guest report on a real listing and 404s a fake id', async () => {
    const v = await registerVendor('rep', 'Ikeja');
    const item = await createItem(v.cookie, 'Report Me Dress', 1200000);
    const ok = await api('/api/public/reports', {
      method: 'POST',
      body: { entity_type: 'listing', entity_id: item.id, reason: 'misleading', details: 'Stock photos' },
    });
    expect(ok.status, JSON.stringify(ok.json)).toBe(200);

    const missing = await api('/api/public/reports', {
      method: 'POST',
      body: { entity_type: 'listing', entity_id: 999999, reason: 'spam' },
    });
    expect(missing.status).toBe(404);

    const bad = await api('/api/public/reports', {
      method: 'POST',
      body: { entity_type: 'listing', entity_id: item.id, reason: 'not-a-reason' },
    });
    expect(bad.status).toBeGreaterThanOrEqual(400);
  });
});
