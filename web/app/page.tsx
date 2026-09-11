import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import { clientIp } from '@/lib/ip';
import type { HomeOut } from '@/lib/types';
import BusinessCard from '@/components/BusinessCard';
import SearchForm from '@/components/SearchForm';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let data: HomeOut;
  try {
    data = await api<HomeOut>('/public/home', { ip: await clientIp() });
  } catch (e) {
    if (e instanceof Error && e.message.includes('not found')) notFound();
    throw e;
  }
  const platform = data.platform;

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>{platform?.tagline ?? 'Find a business. Talk to it on WhatsApp.'}</h1>
          <p>
            Browse catalogues from real businesses — courses, products, services — and message the
            owner directly on WhatsApp. No carts, no checkout, no middlemen.
          </p>
          <SearchForm big />
          <div className="hero-stats">
            {data.business_count > 0
              ? `${data.business_count} active business${data.business_count === 1 ? '' : 'es'} and growing`
              : 'The first businesses are joining — browse categories below'}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <h2>Browse by category</h2>
          </div>
          {data.categories.length === 0 ? (
            <div className="empty">
              <h2>No categories yet</h2>
              <p>Check back soon.</p>
            </div>
          ) : (
            <div className="grid grid-cats">
              {data.categories.map((c) => (
                <a key={c.slug} className="card cat-card" href={`/categories/${c.slug}`}>
                  <span className="cat-icon" aria-hidden>
                    {c.icon || '📁'}
                  </span>
                  <span className="cat-name">{c.name}</span>
                  {c.description && <span className="cat-desc">{c.description}</span>}
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-head">
            <h2>Featured businesses</h2>
            <a href="/businesses">View all →</a>
          </div>
          {data.businesses.length === 0 ? (
            <div className="empty">
              <h2>No businesses yet</h2>
              <p>Be the first to list your business on CyberShop.</p>
            </div>
          ) : (
            <div className="grid grid-biz">
              {data.businesses.map((b) => (
                <BusinessCard key={b.id} b={b} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
