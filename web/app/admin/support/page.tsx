'use client';

import { useCallback, useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Ticket { id: number; email: string; name: string | null; subject: string; status: string; messages: number; created_at: string; updated_at: string }
interface Msg { author: string; body: string; created_at: string }

/** Admin support queue: oldest first, reply in place. */
export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [status, setStatus] = useState('open');
  const [open, setOpen] = useState<{ ticket: Ticket; messages: Msg[] } | null>(null);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await capi<{ tickets: Ticket[] }>(`/admin/support?status=${status}`);
      setTickets(r.tickets);
    } catch (e) { setError(extractError(e)); }
  }, [status]);
  useEffect(() => { void load(); }, [load]);

  async function view(id: number) {
    try {
      const r = await capi<{ ticket: Ticket; messages: Msg[] }>(`/admin/support/${id}`);
      setOpen(r);
    } catch (e) { setError(extractError(e)); }
  }

  async function send(close: boolean) {
    if (!open) return;
    try {
      await capi(`/admin/support/${open.ticket.id}/reply`, { method: 'POST', body: JSON.stringify({ message: reply, close }) });
      setReply('');
      setOpen(null);
      await load();
    } catch (e) { setError(extractError(e)); }
  }

  const age = (iso: string) => {
    const h = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3600_000));
    return h < 1 ? '<1h old' : h < 48 ? `${h}h old` : `${Math.round(h / 24)}d old`;
  };

  return (
    <div>
      <div className="dash-head"><h1>Support tickets</h1></div>
      {error && <div className="form-msg error">{error}</div>}
      <div className="toolbar">
        <select className="select" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
          <option value="open">Open</option><option value="answered">Answered</option><option value="closed">Closed</option><option value="all">All</option>
        </select>
        <span role="status">{tickets.length} tickets</span>
      </div>
      <div className="card table-wrap">
        <table className="tbl">
          <thead><tr><th>#</th><th>From</th><th>Subject</th><th>Age</th><th>Msgs</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id}>
                <td>#{t.id}</td><td>{t.name ?? ''} {t.email}</td><td>{t.subject}</td>
                <td>{age(t.created_at)}</td><td>{t.messages}</td><td>{t.status}</td>
                <td><button type="button" className="btn btn-ghost" onClick={() => view(t.id)}>Open</button></td>
              </tr>
            ))}
            {tickets.length === 0 && <tr><td colSpan={7}>Queue is clear. 🎉</td></tr>}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="card panel" style={{ marginTop: 16 }}>
          <h2>#{open.ticket.id} — {open.ticket.subject}</h2>
          <p style={{ color: 'var(--muted)' }}>{open.ticket.email}</p>
          <div style={{ display: 'grid', gap: 10, margin: '12px 0' }}>
            {open.messages.map((m, i) => (
              <div key={i} className={m.author === 'admin' ? 'banner' : 'banner warn'}>
                <strong>{m.author === 'admin' ? 'Support' : 'User'}</strong>
                <p style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{m.body}</p>
                <small>{new Date(m.created_at).toLocaleString()}</small>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <textarea className="textarea" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} aria-label="Reply" placeholder="Reply as support…" />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-primary" disabled={!reply.trim()} onClick={() => send(false)}>Send reply</button>
              <button type="button" className="btn btn-ghost" disabled={!reply.trim()} onClick={() => send(true)}>Reply & close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
