'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { capi, extractError } from '@/lib/client-api';

interface Thread {
  id: number;
  buyer_name: string | null;
  item_name: string | null;
  last_body: string | null;
  updated_at: string;
  status: string;
}

export default function InboxPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await capi<{ threads: Thread[]; locked?: boolean; message?: string }>('/vendor/threads');
      setThreads(d.threads);
      setLocked(!!d.locked);
      setMessage(d.message ?? '');
    } catch (e) {
      setError(extractError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="dash-head">
        <h1>Inbox</h1>
      </div>
      {error && <div className="form-msg error">{error}</div>}
      {locked ? (
        <div className="empty">
          <h2>In-app chat is a paid add-on</h2>
          <p>
            {message || 'Buy In-app inbox under Plan & billing. Buyers can still reach you on WhatsApp for free.'}
          </p>
          <Link className="btn btn-primary" href="/dashboard/billing">
            Plan & billing
          </Link>
        </div>
      ) : threads.length === 0 ? (
        <div className="empty">
          <h2>No conversations yet</h2>
          <p>When a buyer messages you on CyberShop, it lands here. WhatsApp leads stay on Leads.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {threads.map((t) => (
            <Link key={t.id} href={`/dashboard/inbox/${t.id}`} className="card panel" style={{ color: 'inherit', textDecoration: 'none' }}>
              <strong>{t.buyer_name || 'Buyer'}</strong>
              {t.item_name ? <span style={{ color: 'var(--muted)' }}> · {t.item_name}</span> : null}
              <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: '0.9rem' }}>{t.last_body}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
