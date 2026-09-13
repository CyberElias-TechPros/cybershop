import type { BusinessOut } from '@/lib/types';
import { initials, location } from '@/lib/ui';

export default function BusinessCard({ b, featured = false }: { b: BusinessOut; featured?: boolean }) {
  return (
    <a
      className={`card tilt${featured ? ' biz-featured' : ''}`}
      href={`/business/${b.slug}`}
      style={{ color: 'inherit' }}
      data-flip={`biz:${b.slug}`}
      data-flip-src=""
      aria-label={`${b.name}${location(b) ? ' — ' + location(b) : ''}`}
    >
      <div className="biz-thumb">
        <span className="skel" aria-hidden="true" />
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
        <div className="biz-cats" aria-hidden="true">
          {b.categories.slice(0, 3).map((c) => (
            <span className="chip" key={c.slug}>
              {c.name}
            </span>
          ))}
        </div>
      </div>
    </a>
  );
}
