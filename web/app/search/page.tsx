import { Suspense } from 'react';
import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { clientIp } from '@/lib/ip';
import type { SearchOut } from '@/lib/types';
import SearchForm from '@/components/SearchForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Search' };

interface SP {
  q?: string;
}

export default function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <Suspense>
      <Inner searchParams={searchParams} />
    </Suspense>
  );
}

async function Inner({ searchParams }: { searchParams: Promise<SP> }) {
  const { q: raw } = await searchParams;
  const q = (raw ?? '').trim();
  const data = q.length >= 2 ? await api<SearchOut>(`/public/search?q=${encodeURIComponent(q)}`, { ip: await clientIp() }) : null;

  return (
    <section className="section">
      <div className="container">
        <h1>Search</h1>
        <div style={{ maxWidth: 480, marginBottom: 24 }}>
          <SearchForm initial={q} />
        </div>
        {!data && <p style={{ color: 'var(--muted)' }}>Type at least 2 characters to search businesses and listings.</p>}
        {data && data.total === 0 && (
          <div className="empty">
            <h2>Nothing found for “{q}”</h2>
            <p>Try a different word, or <a href="/businesses">browse all businesses</a>.</p>
          </div>
        )}
        {data && data.total > 0 && (
          <>
            {data.businesses.length > 0 && (
              <div className="section-head">
                <h2>Businesses</h2>
              </div>
            )}
            <div className="search-results">
              {data.businesses.map((b) => (
                <a key={`b${b.id}`} className="card result-row" href={`/business/${b.slug}`}>
                  <div className="biz-initials" style={{ width: 56, height: 56, fontSize: '1.2rem', flexShrink: 0 }} aria-hidden>
                    {b.name[0]}
                  </div>
                  <div>
                    <div className="result-name">{b.name}</div>
                    <div className="result-sub">Business{b.city ? ` · ${b.city}` : ''}</div>
                  </div>
                </a>
              ))}
            </div>
            {data.items.length > 0 && (
              <>
                <div className="section-head" style={{ marginTop: 26 }}>
                  <h2>Listings</h2>
                </div>
                <div className="search-results">
                  {data.items.map((it) => (
                    <a key={`i${it.id}`} className="card result-row" href={`/business/${it.biz_slug}/${it.url_segment}/${it.slug}`}>
                      {it.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.image} alt="" loading="lazy" />
                      ) : (
                        <div style={{ width: 56, height: 56, borderRadius: 8, background: '#eef3f1', flexShrink: 0 }} aria-hidden />
                      )}
                      <div>
                        <div className="result-name">{it.name}</div>
                        <div className="result-sub">
                          {it.biz_name} · {it.price_display}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
