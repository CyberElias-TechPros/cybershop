import { describe, it, expect } from 'vitest';
import { setupIntegration, api } from './harness';

setupIntegration();

async function registerVendor(suffix: string, city = 'Lagos') {
  const email = `vendor-shop-${suffix}@test.ng`;
  let r = await api('/api/auth/register', {
    method: 'POST',
    body: {
      role: 'vendor', name: `Vendor SH ${suffix}`, email, phone: '+2348031111111', password: 'Passw0rd123',
      business_name: `SH Store ${suffix}`, category_slug: 'fashion', whatsapp_number: '08031111111', city,
    },
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  const cookie = r.cookie!;
  r = await api('/api/vendor/payment-intent', { method: 'POST', body: { plan_slug: 'free', method: 'bank_transfer' }, cookie });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  const me = await api('/api/auth/me', { cookie });
  return { cookie, slug: me.json.business.slug as string };
}

async function createItem(cookie: string, name: string, priceKobo: number) {
  const r = await api('/api/vendor/items', {
    method: 'POST', cookie,
    body: { name, item_type_slug: 'product', category_slug: 'fashion', price_kobo: priceKobo, price_type: 'fixed', publish: true, stock_status: 'in_stock' },
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  return r.json as { id: number; slug: string };
}

describe('shop-first public surfaces', () => {
  it('home is a shop: fresh listings, counts and cities ride along', async () => {
    const v = await registerVendor('home', 'Lagos');
    await createItem(v.cookie, 'Shopfront Ankara Dress', 1200000);

    const home = await api('/api/public/home');
    expect(home.status).toBe(200);
    const names = (home.json.listings as { name: string }[]).map((i) => i.name);
    expect(names).toContain('Shopfront Ankara Dress');
    expect(home.json.listing_count).toBeGreaterThanOrEqual(1);
    expect(home.json.business_count).toBeGreaterThanOrEqual(1);
    expect((home.json.cities as { city: string }[]).some((c) => c.city === 'Lagos')).toBe(true);

    const card = (home.json.listings as Record<string, unknown>[]).find((i) => i.name === 'Shopfront Ankara Dress')!;
    expect(card.biz_name).toBe('SH Store home');
    expect(card.price_display).toContain('₦');
    expect(card.stock_status).toBe('in_stock');
    // No reviews yet → rating must be honestly empty, never invented.
    expect((card.rating as { count: number; average: number | null }).count).toBe(0);
    expect((card.rating as { average: number | null }).average).toBeNull();

    // The directory cards are batched but still carry counts.
    const biz = (home.json.businesses as Record<string, unknown>[]).find((b) => b.slug === v.slug)!;
    expect(biz.listing_count).toBeGreaterThanOrEqual(1);
  });

  it('a category page is an aisle: listings first, stores second', async () => {
    const v = await registerVendor('cat', 'Abuja');
    await createItem(v.cookie, 'Category Aisle Gown', 2500000);

    const cat = await api('/api/public/categories/fashion');
    expect(cat.status).toBe(200);
    const names = (cat.json.listings as { name: string }[]).map((i) => i.name);
    expect(names).toContain('Category Aisle Gown');
    expect(cat.json.listing_total).toBeGreaterThanOrEqual(1);
    expect((cat.json.businesses as { slug: string }[]).some((b) => b.slug === v.slug)).toBe(true);
  });

  it('public plans power the /sell pricing page', async () => {
    const r = await api('/api/public/plans');
    expect(r.status).toBe(200);
    const slugs = (r.json.plans as { slug: string }[]).map((p) => p.slug);
    expect(slugs).toContain('free');
    const free = (r.json.plans as Record<string, unknown>[]).find((p) => p.slug === 'free')!;
    expect(free.price_display).toBe('Free');
    expect(Array.isArray(free.features)).toBe(true);
    expect((free.features as string[]).length).toBeGreaterThan(0);
    // No internal quota JSON leaks to the public page.
    expect(free.quota).toBeUndefined();
  });

  it('the classifieds feed carries card trust fields', async () => {
    const feed = await api('/api/public/listings?category=fashion');
    expect(feed.status).toBe(200);
    const item = (feed.json.items as Record<string, unknown>[])[0]!;
    expect(item).toHaveProperty('stock_status');
    expect(item).toHaveProperty('rating');
    expect(item).toHaveProperty('category_slug');
  });
});
