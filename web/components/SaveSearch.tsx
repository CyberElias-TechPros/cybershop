'use client';

import { useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

const KEY = 'cs-saved-search-v1';

interface Search {
  q?: string;
  city?: string;
  category?: string;
  min?: string;
  max?: string;
}

function loadLocal(): Search[] {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(j) ? (j as Search[]) : [];
  } catch {
    return [];
  }
}

export default function SaveSearch({ search }: { search: Search }) {
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    const hits = loadLocal().some(
      (s) => s.q === search.q && s.city === search.city && s.category === search.category && s.min === search.min && s.max === search.max
    );
    setSaved(hits);
  }, [search]);

  async function save() {
    setErr('');
    const next = [search, ...loadLocal().filter((s) => JSON.stringify(s) !== JSON.stringify(search))].slice(0, 20);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
    setSaved(true);
    setMsg('Saved on this device.');
    try {
      await capi('/public/saved-searches', {
        method: 'POST',
        body: JSON.stringify({
          q: search.q || null,
          city: search.city || null,
          category: search.category || null,
          min_price: search.min ? Math.round(Number(search.min) * 100) : null,
          max_price: search.max ? Math.round(Number(search.max) * 100) : null,
        }),
      });
      setMsg('Saved. We’ll notify you hourly when you’re signed in.');
    } catch (e) {
      const m = extractError(e);
      if (!m.includes('signed in') && !m.includes('401')) setErr(m);
    }
  }

  const empty = !search.q && !search.city && !search.category && !search.min && !search.max;
  if (empty) return null;

  return (
    <div style={{ margin: '10px 0 22px' }}>
      <button type="button" className="mini-btn" onClick={save} disabled={saved}>
        {saved ? 'Search saved' : 'Save this search'}
      </button>
      {msg && <span style={{ marginLeft: 10, fontSize: '0.85rem', color: 'var(--muted)' }}>{msg}</span>}
      {err && <span style={{ marginLeft: 10, fontSize: '0.85rem', color: 'var(--danger)' }}>{err}</span>}
    </div>
  );
}
