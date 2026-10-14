'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const CITY_KEY = 'cs-city';

/**
 * The shop's front-door search: one query + one city, submitted straight to
 * the unified shop feed (/listings). The chosen city is remembered
 * (localStorage) so a returning buyer doesn't re-teach the app where they
 * live on every visit — "All Nigeria" clears it.
 */
export default function ShopSearch({ cities }: { cities: { city: string; n: number }[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CITY_KEY);
      if (saved && cities.some((c) => c.city === saved)) setCity(saved);
    } catch { /* private mode */ }
  }, [cities]);

  function pickCity(next: string) {
    setCity(next);
    try {
      if (next) localStorage.setItem(CITY_KEY, next);
      else localStorage.removeItem(CITY_KEY);
    } catch { /* private mode */ }
  }

  return (
    <form
      className="shop-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const u = new URLSearchParams();
        if (q.trim()) u.set('q', q.trim());
        if (city) u.set('city', city);
        const s = u.toString();
        router.push(s ? `/listings?${s}` : '/listings');
      }}
    >
      <label className="sr-only" htmlFor="shop-q">What are you looking for?</label>
      <input
        id="shop-q"
        className="shop-search-input"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search products, courses, services…"
        enterKeyHint="search"
        autoComplete="off"
      />
      <label className="sr-only" htmlFor="shop-city">City</label>
      <select id="shop-city" className="shop-search-city" value={city} onChange={(e) => pickCity(e.target.value)} aria-label="City">
        <option value="">All Nigeria</option>
        {cities.map((c) => (
          <option key={c.city} value={c.city}>{c.city}</option>
        ))}
      </select>
      <button className="btn btn-wa shop-search-btn" type="submit">Search</button>
    </form>
  );
}
