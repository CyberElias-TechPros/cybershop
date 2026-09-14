'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { capi, extractError } from '@/lib/client-api';

interface Msg {
  id: number;
  author: string;
  body: string;
  created_at: string;
}

export default function VendorThreadPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [title, setTitle] = useState('Conversation');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await capi<{ thread: { buyer_name: string | null; item_name: string | null }; messages: Msg[] }>(`/vendor/threads/${id}`);
      setMsgs(d.messages);
      setTitle(`${d.thread.buyer_name || 'Buyer'}${d.thread.item_name ? ` · ${d.thread.item_name}` : ''}`);
    } catch (e) {
      setError(extractError(e));
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    setBusy(true);
    setError('');
    try {
      await capi(`/vendor/threads/${id}/messages`, { method: 'POST', body: JSON.stringify({ body: text }) });
      setText('');
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="dash-head">
        <h1>{title}</h1>
        <Link className="mini-btn" href="/dashboard/inbox">
          ← Inbox
        </Link>
      </div>
      {error && <div className="form-msg error">{error}</div>}
      <div className="card panel" style={{ display: 'grid', gap: 10 }}>
        {msgs.map((m) => (
          <div key={m.id} style={{ textAlign: m.author === 'vendor' ? 'right' : 'left' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{m.author === 'vendor' ? 'You' : 'Buyer'}</div>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.body}</p>
          </div>
        ))}
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="reply">Reply</label>
        <textarea id="reply" className="textarea" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <button className="btn btn-primary" type="button" onClick={send} disabled={busy || text.trim().length < 1}>
        {busy ? 'Sending…' : 'Send'}
      </button>
    </div>
  );
}
