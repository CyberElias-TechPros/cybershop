'use client';

import { useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Note {
  id: number;
  type: string;
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
}
interface Saved {
  id: number;
  q: string | null;
  city: string | null;
  category: string | null;
}

export default function AlertsPage() {
  const [rows, setRows] = useState<Note[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      capi<{ notifications: Note[] }>('/account/notifications'),
      capi<{ searches: Saved[] }>('/public/saved-searches'),
    ]).then(([n, s]) => {
      setRows(n.notifications);
      setSaved(s.searches);
    }).catch((e) => setError(extractError(e)));
  }, []);

  return (
    <div>
      <div className="dash-head">
        <h1>Alerts</h1>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={async () => {
            await capi('/account/notifications/read', { method: 'POST', body: '{}' });
            setRows((r) => r.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
          }}
        >
          Mark all read
        </button>
      </div>
      <p style={{ color: 'var(--muted)' }}>Search matches, replies, and deposit updates land here. Email copies go out when a mail key is configured.</p>
      {error && <div className="form-msg error">{error}</div>}
      <h2>Saved searches</h2>
      <form
        className="form-row"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const r = await capi<{ id: number }>('/public/saved-searches', { method: 'POST', body: JSON.stringify({ q }) });
            setSaved((xs) => [{ id: r.id, q, city: null, category: null }, ...xs]);
            setQ('');
          } catch (err) { setError(extractError(err)); }
        }}
      >
        <label className="field">Watch a search<input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ankara" required minLength={2} /></label>
        <button className="btn btn-primary" type="submit">Save</button>
      </form>
      {saved.length === 0 ? <p style={{ color: 'var(--muted)' }}>No saved searches. New matches become alerts.</p> : (
        <ul>
          {saved.map((s) => (
            <li key={s.id}>
              {s.q || 'Any'}{s.city ? ` · ${s.city}` : ''}{' '}
              <button type="button" className="mini-btn danger" onClick={async () => {
                await capi(`/public/saved-searches/${s.id}`, { method: 'DELETE' });
                setSaved((xs) => xs.filter((x) => x.id !== s.id));
              }}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <h2>Notifications</h2>
      {rows.length === 0 ? <p>No alerts yet.</p> : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
          {rows.map((n) => (
            <li key={n.id} className="card panel" style={{ opacity: n.read_at ? 0.7 : 1 }}>
              <strong>{n.title}</strong>
              {n.body && <p style={{ margin: '4px 0 0' }}>{n.body}</p>}
              <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{new Date(n.created_at).toLocaleString('en-NG')}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
