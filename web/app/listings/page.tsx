import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { clientIp } from '@/lib/ip';
import { sessionCookieHeader } from '@/lib/session';
import type { CategoryOut, ListingsOut } from '@/lib/types';
import ListingCard from '@/components/ListingCard';
import Pager from '@/components/Pager';
import { Reveal } from '@/components/Motion';
import SaveSearch from '@/components/SaveSearch';

export const dynamic = 'force-dynamic';
export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const q = (sp.q ?? '').trim();
  const city = (sp.city ?? '').trim();
  const parts = [q ? `“${q}”` : null, city || null].filter(Boolean).join(' in ');
  // Filtered combinations canonicalise to the clean feed; unfiltered pagination keeps ?page=N.
  const filtered = Boolean(q || city || sp.category || sp.min || sp.max);
  const canonical = filtered ? '/listings' : page > 1 ? `/listings?page=${page}` : '/listings';
  return {
    title: parts ? `${parts} — listings` : page > 1 ? `Listings — page ${page}` : 'Listings',
    description: 'Browse ads from real Nigerian businesses. Pick one, talk on WhatsApp, inspect, pay the seller directly — CyberShop never takes your money.',
    alternates: { canonical },
    openGraph: { title: 'Listings', url: canonical },
  };
}

interface SP {
  q?: string;
  city?: string;
  category?: string;
  type?: string;
  stock?: string;
  rating?: string;
  sort?: string;
  min?: string;
  max?: string;
  page?: string;
  [key: string]: string | undefined;
}

export default function ListingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  // No Suspense shell: this is a core SEO surface — render the full feed
  // inline so non-JS crawlers (WhatsApp, social unfurlers) see the market.
  return <Inner searchParams={searchParams} />;
}

async function Inner({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 80);
  const city = (sp.city ?? '').trim().slice(0, 80);
  const category = (sp.category ?? '').trim().slice(0, 60);
  const type = (sp.type ?? '').trim().slice(0, 40);
  const stock = sp.stock === 'in_stock' ? 'in_stock' : '';
  const rating = ['1', '2', '3', '4', '5'].includes(sp.rating ?? '') ? sp.rating! : '';
  const sort = (sp.sort ?? 'newest').slice(0, 20);
  const minNaira = sp.min ? Number(sp.min) : NaN;
  const maxNaira = sp.max ? Number(sp.max) : NaN;
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const fieldValues: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (k.startsWith('cf_') && v) fieldValues[k] = v.slice(0, 80);
  }

  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (city) query.set('city', city);
  if (category) query.set('category', category);
  if (type) query.set('type', type);
  if (stock) query.set('stock', stock);
  if (rating) query.set('min_rating', rating);
  if (sort && sort !== 'newest') query.set('sort', sort);
  if (Number.isFinite(minNaira) && minNaira > 0) query.set('min_price', String(Math.round(minNaira * 100)));
  if (Number.isFinite(maxNaira) && maxNaira > 0) query.set('max_price', String(Math.round(maxNaira * 100)));
  for (const [k, v] of Object.entries(fieldValues)) query.set(k, v);
  query.set('page', String(page));

  const ip = await clientIp();
  const cookie = await sessionCookieHeader();
  const data = await api<ListingsOut>(`/public/listings?${query}`, { ip, cookie });
  let cats: CategoryOut[] = [];
  let cities: { city: string; n: number }[] = [];
  let types: { name: string; slug: string }[] = [];
  try {
    const home = await api<{ categories: CategoryOut[] }>('/public/home', { ip });
    cats = home.categories;
  } catch {
    /* optional */
  }
  try {
    const c = await api<{ cities: { city: string; n: number }[] }>('/public/cities', { ip });
    cities = c.cities;
  } catch {
    /* optional */
  }
  try {
    types = (await api<{ types: { name: string; slug: string }[] }>('/public/item-types', { ip })).types;
  } catch {
    /* optional */
  }

  const hrefFor = (over: { q?: string; city?: string; category?: string; sort?: string; min?: string; max?: string; page?: number }) => {
    const u = new URLSearchParams();
    const next = { q, city, category, type, stock, rating, sort, min: sp.min, max: sp.max, page, ...over };
    if (next.q) u.set('q', next.q);
    if (next.city) u.set('city', next.city);
    if (next.category) u.set('category', next.category);
    if (next.type) u.set('type', next.type);
    if (next.stock) u.set('stock', next.stock);
    if (next.rating) u.set('rating', next.rating);
    if (next.sort && next.sort !== 'newest') u.set('sort', next.sort);
    if (next.min) u.set('min', next.min);
    if (next.max) u.set('max', next.max);
    for (const [k, v] of Object.entries(fieldValues)) u.set(k, v);
    if (next.page && next.page > 1) u.set('page', String(next.page));
    const s = u.toString();
    return s ? `/listings?${s}` : '/listings';
  };

  return (
    <section className="section" style={{ paddingTop: 'clamp(36px, 6vw, 64px)' }}>
      <div className="container">
        <Reveal>
          <div className="section-head">
            <div>
              <span className="eyebrow">Classifieds</span>
              <h1>
                Ads, not a <em>checkout</em>
              </h1>
            </div>
            <span className="section-count" aria-live="polite">
              {data.total} listing{data.total === 1 ? '' : 's'}
            </span>
          </div>
        </Reveal>
        <p style={{ color: 'var(--ink-dim)', maxWidth: '52ch', marginTop: 0 }}>
          Like Jiji: pick an ad, talk to the seller on WhatsApp, inspect, then pay them directly.
          CyberShop never takes your money.
        </p>

        <form className="market-filters" method="get" action="/listings">
          <input className="input" name="q" defaultValue={q} placeholder="What are you looking for?" aria-label="Search listings" />
          <select className="input" name="city" defaultValue={city} aria-label="City">
            <option value="">All Nigeria</option>
            {cities.map((c) => (
              <option key={c.city} value={c.city}>
                {c.city}
              </option>
            ))}
          </select>
          <select className="input" name="category" defaultValue={category} aria-label="Category">
            <option value="">All categories</option>
            {cats.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="input" name="type" defaultValue={type} aria-label="Catalogue type">
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t.slug} value={t.slug}>{t.name}</option>
            ))}
          </select>
          <select className="input" name="stock" defaultValue={stock} aria-label="Availability">
            <option value="">Any availability</option>
            <option value="in_stock">In stock</option>
          </select>
          <select className="input" name="rating" defaultValue={rating} aria-label="Minimum rating">
            <option value="">Any rating</option>
            <option value="4">4 stars and up</option>
            <option value="3">3 stars and up</option>
          </select>
          <select className="input" name="sort" defaultValue={sort} aria-label="Sort">
            <option value="newest">Newest</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="rating">Highest rated</option>
          </select>
          <input className="input" name="min" type="number" min={0} defaultValue={sp.min ?? ''} placeholder="Min ₦" aria-label="Minimum naira" />
          <input className="input" name="max" type="number" min={0} defaultValue={sp.max ?? ''} placeholder="Max ₦" aria-label="Maximum naira" />
          {(data.field_filters ?? []).map((f) => (
            <select key={f.key} className="input" name={`cf_${f.key}`} defaultValue={fieldValues[`cf_${f.key}`] ?? ''} aria-label={f.label}>
              <option value="">{f.label}</option>
              {f.options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ))}
          <button className="btn btn-gold" type="submit">
            Filter
          </button>
        </form>
        <SaveSearch search={{ q, city, category, min: sp.min, max: sp.max }} />

        {data.items.length === 0 ? (
          <div className="empty">
            <span className="empty-icon" aria-hidden>
              🪧
            </span>
            <h2>No ads match</h2>
            <p>
              Try another city or <a href="/listings">clear filters</a>.
            </p>
          </div>
        ) : (
          <div className="grid grid-items" data-elastic="">
            {data.items.map((it, i) => (
              <Reveal key={it.id} i={i % 4}>
                <ListingCard it={it} />
              </Reveal>
            ))}
          </div>
        )}
        <Pager page={page} pages={data.pages} makeUrl={(p) => hrefFor({ page: p })} />
      </div>
    </section>
  );
}
