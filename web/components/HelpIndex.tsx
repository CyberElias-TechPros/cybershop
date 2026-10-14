'use client';

import { useMemo, useState } from 'react';
import { GUIDE_GROUPS, type Guide, type GuideAudience } from '@/lib/guides';

type Summary = Pick<Guide, 'slug' | 'title' | 'icon' | 'audience' | 'summary' | 'minutes' | 'keywords'>;

/** Searchable, grouped Help Centre index. Filtering is instant and local. */
export default function HelpIndex({ guides }: { guides: Summary[] }) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!query) return guides;
    return guides.filter((g) =>
      [g.title, g.summary, ...g.keywords].join(' ').toLowerCase().includes(query),
    );
  }, [guides, query]);

  const byGroup = (id: GuideAudience) => matches.filter((g) => g.audience === id);

  return (
    <div>
      <div className="help-search" role="search">
        <span aria-hidden>🔎</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search guides — try “deposit”, “2FA”, “domain”…"
          aria-label="Search guides"
        />
        {q && (
          <button type="button" className="help-search-clear" onClick={() => setQ('')} aria-label="Clear search">
            ×
          </button>
        )}
      </div>

      {query && (
        <p className="help-count" role="status">
          {matches.length} guide{matches.length === 1 ? '' : 's'} for “{q.trim()}”
          {matches.length === 0 && (
            <>
              {' '}— try a shorter word, or <a href="/contact">ask Support</a>.
            </>
          )}
        </p>
      )}

      {GUIDE_GROUPS.map((group) => {
        const items = byGroup(group.id);
        if (items.length === 0) return null;
        return (
          <section key={group.id} id={group.id} className="help-group">
            <div className="help-group-head">
              <h2>{group.title}</h2>
              <p>{group.blurb}</p>
            </div>
            <div className="help-grid">
              {items.map((g) => (
                <a key={g.slug} href={`/help/${g.slug}`} className="help-card fx-rise">
                  <span className="help-card-icon" aria-hidden>{g.icon}</span>
                  <span className="help-card-body">
                    <strong>{g.title}</strong>
                    <span>{g.summary}</span>
                    <em>{g.minutes} min read</em>
                  </span>
                  <span className="help-card-arrow" aria-hidden>→</span>
                </a>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
