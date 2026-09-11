import type { BusinessOut } from '@/lib/types';
import { initials, location } from '@/lib/ui';

export default function BusinessCard({ b }: { b: BusinessOut }) {
  return (
    <a className="card" href={`/business/${b.slug}`} style={{ color: 'inherit' }}>
      <div className="biz-thumb">
        {b.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.cover.url} alt="" loading="lazy" />
        ) : b.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.logo.url} alt={b.logo.alt} loading="lazy" style={{ objectFit: 'contain', padding: 18 }} />
        ) : (
          <div className="biz-initials" aria-hidden>
            {initials(b.name)}
          </div>
        )}
      </div>
      <div className="biz-body">
        <p className="biz-name">{b.name}</p>
        {location(b) && <p className="biz-loc">{location(b)}</p>}
        <div className="biz-cats">
          {b.categories.slice(0, 3).map((c) => (
            <span className="chip" key={c.slug}>
              <a href={`/categories/${c.slug}`}>{c.name}</a>
            </span>
          ))}
        </div>
      </div>
    </a>
  );
}
