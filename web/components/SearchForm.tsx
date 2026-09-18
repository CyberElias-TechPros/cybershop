'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SearchForm({ initial = '', big = false }: { initial?: string; big?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  return (
    <form
      className={`search-form${big ? ' big' : ''}`}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const query = q.trim();
        router.push(query ? `/search?q=${encodeURIComponent(query)}` : '/search');
      }}
    >
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={big ? 'Search businesses, courses, products…' : 'Search…'}
        aria-label="Search"
        enterKeyHint="search"
      />
      <button type="submit" className={big ? 'btn btn-wa' : 'btn btn-primary'}>
        Search
      </button>
    </form>
  );
}
