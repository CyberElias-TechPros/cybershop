'use client';

import { useCallback, useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Ticket { id: number; subject: string; status: string; created_at: string; updated_at: string }
interface Msg { author: string; body: string; created_at: string }

/** Your support tickets: tracked threads instead of lost emails. */
export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [open, setOpen] = useState<{ ticket: Ticket; messages: Msg[] } | null>(null);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await capi<{ tickets: Ticket[] }>('/account/support');
      setTickets(r.tickets);
    } catch (e) { setError(extractError(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function view(id: number) {
    try {
      const r = await capi<{ ticket: Ticket; messages: Msg[] }>(`/account/support/${id}`);
      setOpen(r);
    } catch (e) { setError(extractError(e)); }
  }

  async function send() {
    if (!open) return;
    try {
      await capi(`/account/support/${open.ticket.id}`, { method: 'POST', body: JSON.stringify({ message: reply }) });
      setReply('');
      await view(open.ticket.id);
      await load();
    } catch (e) { setError(extractError(e)); }
  }

  return (
    <div>
      <h1>Support tickets</h1>
      <p style={{ color: 'var(--muted)' }}>Every conversation with the CyberShop team, tracked. New here? <a href="/contact">Open a ticket</a>.</p>
      {error && <div className="form-msg error">{error}</div>}
      <div className="card table-wrap" style={{ marginTop: 14 }}>
        <table className="tbl">
          <thead><tr><th>#</th><th>Subject</th><th>Status</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id}>
                <td>#{t.id}</td><td>{t.subject}</td><td>{t.status}</td>
                <td>{new Date(t.updated_at).toLocaleString()}</td>
                <td><button type="button" className="btn btn-ghost" onClick={() => view(t.id)}>Open</button></td>
              </tr>
            ))}
            {tickets.length === 0 && <tr><td colSpan={5}>No tickets yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="card panel" style={{ marginTop: 16 }}>
          <h2>#{open.ticket.id} — {open.ticket.subject}</h2>
          <div style={{ display: 'grid', gap: 10, margin: '12px 0' }}>
            {open.messages.map((m, i) => (
              <div key={i} className={m.author === 'admin' ? 'banner' : 'banner warn'}>
                <strong>{m.author === 'admin' ? 'CyberShop support' : 'You'}</strong>
                <p style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{m.body}</p>
                <small>{new Date(m.created_at).toLocaleString()}</small>
              </div>
            ))}
          </div>
          {open.ticket.status !== 'closed' ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <textarea className="textarea" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} aria-label="Your reply" placeholder="Add to the conversation…" />
              <button type="button" className="btn btn-primary" disabled={!reply.trim()} onClick={send}>Send reply</button>
            </div>
          ) : <p role="status">This ticket is closed.</p>}
        </div>
      )}
    </div>
  );
}
