import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { clientIp } from '@/lib/ip';
import type { SearchOut } from '@/lib/types';
import SearchForm from '@/components/SearchForm';
import { Reveal } from '@/components/Motion';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Search' };

interface SP {
  q?: string;
  city?: string;
}

export default function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  // Inline SSR — results must be visible to non-JS crawlers.
  return <Inner searchParams={searchParams} />;
}

async function Inner({ searchParams }: { searchParams: Promise<SP> }) {
  const { q: raw, city: cityRaw } = await searchParams;
  const q = (raw ?? '').trim();
  const city = (cityRaw ?? '').trim();
  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  if (city) qs.set('city', city);
  const data = q.length >= 2 ? await api<SearchOut>(`/public/search?${qs}`, { ip: await clientIp() }) : null;
  let cities: { city: string }[] = [];
  try {
    cities = (await api<{ cities: { city: string }[] }>('/public/cities', { ip: await clientIp() })).cities;
  } catch {
    /* optional */
  }

  return (
    <section className="section" style={{ paddingTop: 'clamp(36px, 6vw, 64px)' }}>
      <div className="container">
        <Reveal>
          <div className="section-head">
            <div>
              <span className="eyebrow">Search</span>
              <h1>Find it in a heartbeat</h1>
            </div>
          </div>
        </Reveal>
        <Reveal i={1}>
          <form className="market-filters" method="get" action="/search" style={{ marginBottom: 28 }}>
            <input className="input" name="q" defaultValue={q} placeholder="What are you looking for?" aria-label="Search" />
            <select className="input" name="city" defaultValue={city} aria-label="City">
              <option value="">All Nigeria</option>
              {cities.map((c) => (
                <option key={c.city} value={c.city}>
                  {c.city}
                </option>
              ))}
            </select>
            <button className="btn btn-gold" type="submit">
              Search
            </button>
          </form>
        </Reveal>
        {!data && <p style={{ color: 'var(--ink-faint)' }}>Type at least 2 characters to search businesses and listings.</p>}
        {data && data.total === 0 && (
          <div className="empty">
            <span className="empty-icon floaty" aria-hidden>
              🫥
            </span>
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
                        <div style={{ width: 56, height: 56, borderRadius: 10, background: 'var(--glass)', border: '1px solid var(--line)', flexShrink: 0 }} aria-hidden />
                      )}
                      <div>
                        <div className="result-name">{it.name}</div>
                        <div className="result-sub">
                          {it.biz_name}
                          {it.city ? ` · ${it.city}` : ''} · {it.price_display}
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
