'use client';

import { useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Thread {
  id: number;
  token: string;
  status: string;
  updated_at: string;
  business_name: string;
  item_name: string | null;
}

export default function MessagesPage() {
  const [rows, setRows] = useState<Thread[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    capi<{ threads: Thread[] }>('/account/threads').then((d) => setRows(d.threads)).catch((e) => setError(extractError(e)));
  }, []);
  return (
    <div>
      <div className="dash-head"><h1>In-app messages</h1></div>
      <p style={{ color: 'var(--muted)' }}>Only sellers who bought in-app chat appear here. Everyone else is on WhatsApp.</p>
      {error && <div className="form-msg error">{error}</div>}
      {rows.length === 0 ? <p>No in-app threads yet.</p> : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 10 }}>
          {rows.map((t) => (
            <li key={t.id} className="card panel">
              <a href={`/inbox/${t.token}`}><strong>{t.business_name}</strong></a>
              <div style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>{t.item_name || 'General'} · {t.status}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
