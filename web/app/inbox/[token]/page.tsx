'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { capi, extractError } from '@/lib/client-api';

interface Msg {
  id: number;
  author: string;
  body: string;
  created_at: string;
}

export default function GuestInboxPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [title, setTitle] = useState('Conversation');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [dead, setDead] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await capi<{ thread: { business_name: string; item_name: string | null }; messages: Msg[] }>(`/public/threads/${token}`);
      setMsgs(d.messages);
      setTitle(`${d.thread.business_name}${d.thread.item_name ? ` · ${d.thread.item_name}` : ''}`);
    } catch (e) {
      setDead(true);
      setError(extractError(e));
    }
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    setBusy(true);
    setError('');
    try {
      await capi(`/public/threads/${token}/messages`, { method: 'POST', body: JSON.stringify({ body: text }) });
      setText('');
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section" style={{ paddingTop: 'clamp(36px, 6vw, 64px)' }}>
      <div className="container" style={{ maxWidth: 640 }}>
        <span className="eyebrow">In-app chat</span>
        <h1>{title}</h1>
        <p style={{ color: 'var(--ink-dim)' }}>Keep this link — it’s how you continue the conversation without WhatsApp.</p>
        {error && <div className="form-msg error">{error}</div>}
        <div className="card panel" style={{ display: 'grid', gap: 10 }}>
          {msgs.map((m) => (
            <div key={m.id} style={{ textAlign: m.author === 'buyer' ? 'right' : 'left' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{m.author === 'buyer' ? 'You' : 'Seller'}</div>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.body}</p>
            </div>
          ))}
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="gmsg">Message</label>
          <textarea id="gmsg" className="textarea" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="button" onClick={send} disabled={busy || text.trim().length < 1}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </section>
  );
}
