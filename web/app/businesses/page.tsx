import type { Metadata } from 'next';
import { api, PUBLIC_REVALIDATE, TAXONOMY_REVALIDATE } from '@/lib/api';
import { clientIp } from '@/lib/ip';
import { sessionCookieHeader } from '@/lib/session';
import type { BusinessesOut, CategoryOut } from '@/lib/types';
import BusinessCard from '@/components/BusinessCard';
import Pager from '@/components/Pager';
import SearchForm from '@/components/SearchForm';
import { Reveal } from '@/components/Motion';

/* Not `force-dynamic`: that would force every fetch in this route to
   `no-store` and silently undo the `revalidate` passed to `api()` below.
   This page is dynamic anyway — it reads the session cookie (the public
   endpoints filter out businesses the visitor has blocked) — and the
   taxonomy reads are cached for anonymous visitors only. */

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  return {
    title: page > 1 ? `Browse businesses — page ${page}` : 'Browse businesses',
    description:
      'The directory of real Nigerian businesses on CyberShop — fashion, tech, academies, food, homes and services. Open a storefront, start a WhatsApp chat.',
    alternates: { canonical: page > 1 ? `/businesses?page=${page}` : '/businesses' },
    openGraph: { title: 'Browse businesses', url: '/businesses' },
  };
}

interface SP {
  q?: string;
  category?: string;
  city?: string;
  page?: string;
}

export default function BusinessesPage({ searchParams }: { searchParams: Promise<SP> }) {
  // Inline SSR — directory is a core SEO surface (see /listings note).
  return <Inner searchParams={searchParams} />;
}

async function Inner({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 80);
  const category = (sp.category ?? '').trim().slice(0, 60);
  const city = (sp.city ?? '').trim().slice(0, 80);
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (category) query.set('category', category);
  if (city) query.set('city', city);
  query.set('page', String(page));

  const ip = await clientIp();
  const cookie = await sessionCookieHeader();
  const data = await api<BusinessesOut>(`/public/businesses?${query}`, {
    ip,
    cookie,
    revalidate: PUBLIC_REVALIDATE,
  });
  let cats: { name: string; slug: string }[] = [];
  let cities: { city: string }[] = [];
  try {
    const home = await api<{ categories: { name: string; slug: string }[] }>('/public/home', {
      ip,
      revalidate: TAXONOMY_REVALIDATE,
    });
    cats = home.categories;
  } catch {
    /* filter chips are optional */
  }
  try {
    cities = (await api<{ cities: { city: string }[] }>('/public/cities', { ip, revalidate: TAXONOMY_REVALIDATE })).cities;
  } catch {
    /* optional */
  }

  const base = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set('q', q);
    if (category) u.set('category', category);
    if (p > 1) u.set('page', String(p));
    const s = u.toString();
    return s ? `/businesses?${s}` : '/businesses';
  };

  return (
    <section className="section" style={{ paddingTop: 'clamp(36px, 6vw, 64px)' }}>
      <div className="container">
        <Reveal>
          <div className="section-head">
            <div>
              <span className="eyebrow">The directory</span>
              <h1>
                Every stall, <em>one night market</em>
              </h1>
            </div>
            <span className="section-count" role="status" aria-live="polite">
              {data.total} business{data.total === 1 ? '' : 'es'}
              {q ? ` for “${q}”` : ''}
            </span>
          </div>
        </Reveal>
        <Reveal i={1}>
          <div style={{ marginBottom: 16 }}>
            <SearchForm initial={q} />
          </div>
        </Reveal>
        {cats.length > 0 && (
          <Reveal i={2}>
            <div className="biz-cats" style={{ marginBottom: 22 }}>
              <span className={`chip${!category ? ' current' : ''}`}>
                <a href={base(1)}>All</a>
              </span>
              {cats.map((c) => (
                <span key={c.slug} className={`chip${category === c.slug ? ' current' : ''}`}>
                  <a href={`/businesses?category=${c.slug}${q ? `&q=${encodeURIComponent(q)}` : ''}${city ? `&city=${encodeURIComponent(city)}` : ''}`}>
                    {c.name}
                  </a>
                </span>
              ))}
            </div>
          </Reveal>
        )}
        {cities.length > 0 && (
          <Reveal i={3}>
            <div className="biz-cats" style={{ marginBottom: 22 }}>
              <span className={`chip${!city ? ' current' : ''}`}>
                <a href={`/businesses${q || category ? `?${new URLSearchParams({ ...(q ? { q } : {}), ...(category ? { category } : {}) }).toString()}` : ''}`}>
                  All Nigeria
                </a>
              </span>
              {cities.map((c) => (
                <span key={c.city} className={`chip${city === c.city ? ' current' : ''}`}>
                  <a href={`/businesses?city=${encodeURIComponent(c.city)}${q ? `&q=${encodeURIComponent(q)}` : ''}${category ? `&category=${category}` : ''}`}>
                    {c.city}
                  </a>
                </span>
              ))}
            </div>
          </Reveal>
        )}
        {data.businesses.length === 0 ? (
          <div className="empty">
            <span className="empty-icon floaty" aria-hidden>
              🔍
            </span>
            <h2>No businesses match</h2>
            <p>Try a different search or category.</p>
          </div>
        ) : (
          <div className="grid grid-biz" data-elastic="">
            {data.businesses.map((b, i) => (
              <Reveal key={b.id} i={i % 4}>
                <BusinessCard b={b} />
              </Reveal>
            ))}
          </div>
        )}
        <Pager page={page} pages={data.pages} makeUrl={base} />
      </div>
    </section>
  );
}
