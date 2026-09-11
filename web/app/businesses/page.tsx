import { Suspense } from 'react';
import { api } from '@/lib/api';
import { clientIp } from '@/lib/ip';
import type { BusinessesOut, CategoryOut } from '@/lib/types';
import BusinessCard from '@/components/BusinessCard';
import Pager from '@/components/Pager';
import SearchForm from '@/components/SearchForm';

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
    <section className="section">
      <div className="container">
        <div className="section-head">
          <h1>Businesses</h1>
          <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            {data.total} found
          </span>
        </div>
        <div style={{ marginBottom: 14 }}>
          <SearchForm initial={q} />
        </div>
        {cats.length > 0 && (
          <div className="biz-cats" style={{ marginBottom: 18 }}>
            <span className={`chip${!category ? ' current' : ''}`}>
              <a href={base(1)} style={{ color: !category ? '#fff' : undefined }}>
                All
              </a>
            </span>
            {cats.map((c) => (
              <span key={c.slug} className="chip">
                <a
                  href={`/businesses?category=${c.slug}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                  style={{ color: category === c.slug ? '#fff' : undefined }}
                >
                  {c.name}
                </a>
              </span>
            ))}
          </div>
        )}
        {data.businesses.length === 0 ? (
          <div className="empty">
            <h2>No businesses match</h2>
            <p>Try a different search or category.</p>
          </div>
        ) : (
          <div className="grid grid-biz">
            {data.businesses.map((b) => (
              <BusinessCard key={b.id} b={b} />
            ))}
          </div>
        )}
        <Pager page={page} pages={data.pages} makeUrl={base} />
      </div>
    </section>
  );
}
