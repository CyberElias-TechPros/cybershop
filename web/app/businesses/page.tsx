import { Suspense } from 'react';
import { api } from '@/lib/api';
import { clientIp } from '@/lib/ip';
import type { BusinessesOut, CategoryOut } from '@/lib/types';
import BusinessCard from '@/components/BusinessCard';
import Pager from '@/components/Pager';
import SearchForm from '@/components/SearchForm';
import { Reveal } from '@/components/Motion';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Browse businesses' };

interface SP {
  q?: string;
  category?: string;
  page?: string;
}

export default function BusinessesPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <Suspense>
      <Inner searchParams={searchParams} />
    </Suspense>
  );
}

async function Inner({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 80);
  const category = (sp.category ?? '').trim().slice(0, 60);
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (category) query.set('category', category);
  query.set('page', String(page));

  const ip = await clientIp();
  const data = await api<BusinessesOut>(`/public/businesses?${query}`, { ip });
  let cats: { name: string; slug: string }[] = [];
  try {
    const home = await api<{ categories: { name: string; slug: string }[] }>('/public/home', { ip });
    cats = home.categories;
  } catch {
    /* filter chips are optional */
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
            <span className="section-count">
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
                  <a href={`/businesses?category=${c.slug}${q ? `&q=${encodeURIComponent(q)}` : ''}`}>
                    {c.name}
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
