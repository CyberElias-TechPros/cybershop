'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface Suggest {
  businesses: { name: string; slug: string }[];
  items: { name: string; slug: string; url_segment: string; biz_slug: string; biz_name: string }[];
}

export default function SearchForm({ initial = '', big = false }: { initial?: string; big?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Suggest>({ businesses: [], items: [] });
  const box = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setHits({ businesses: [], items: [] });
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/public/suggest?q=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) setHits({ businesses: d.businesses ?? [], items: d.items ?? [] });
        })
        .catch(() => undefined);
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const hasHits = hits.businesses.length + hits.items.length > 0;

  return (
    <form
      ref={box}
      className={`search-form${big ? ' big' : ''}`}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const query = q.trim();
        setOpen(false);
        router.push(query ? `/search?q=${encodeURIComponent(query)}` : '/search');
      }}
    >
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={big ? 'Search businesses, courses, products…' : 'Search…'}
        aria-label="Search"
        aria-autocomplete="list"
        aria-expanded={open && hasHits}
        enterKeyHint="search"
        autoComplete="off"
      />
      <button type="submit" className={big ? 'btn btn-wa' : 'btn btn-primary'}>
        Search
      </button>
      {open && hasHits && (
        <ul className="suggest-pop" role="listbox">
          {hits.businesses.map((b) => (
            <li key={`b-${b.slug}`}>
              <a href={`/business/${b.slug}`} onClick={() => setOpen(false)}>
                {b.name} <span>Store</span>
              </a>
            </li>
          ))}
          {hits.items.map((it) => (
            <li key={`i-${it.biz_slug}-${it.slug}`}>
              <a href={`/business/${it.biz_slug}/${it.url_segment}/${it.slug}`} onClick={() => setOpen(false)}>
                {it.name} <span>{it.biz_name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
