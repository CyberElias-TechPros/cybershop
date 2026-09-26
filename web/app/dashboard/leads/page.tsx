'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { capi, extractError } from '@/lib/client-api';

interface Inquiry {
  id: number;
  buyer_name: string | null;
  buyer_phone: string | null;
  message: string | null;
  wa_url: string | null;
  source: string;
  status: string;
  note: string | null;
  follow_up_at: string | null;
  variant_label: string | null;
  item_name: string | null;
  created_at: string;
  items?: { listing_id: number; quantity: number; name: string; price?: number | null; url?: string | null }[] | null;
}

const STATUSES = ['new', 'contacted', 'interested', 'negotiating', 'converted', 'lost'] as const;
const LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  interested: 'Interested',
  negotiating: 'Negotiating',
  converted: 'Converted',
  lost: 'Lost',
};

export default function LeadsPage() {
  const [items, setItems] = useState<Inquiry[]>([]);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await capi<{ inquiries: Inquiry[]; total: number; page: number; pages: number }>(
        `/vendor/inquiries?status=${filter}&page=${page}`
      );
      setItems(d.inquiries);
      setTotal(d.total);
      setPage(d.page);
      setPages(d.pages);
    } catch (e) {
      setError(extractError(e));
    }
  }, [filter, page]);
  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: number, status: string) {
    setBusyId(id);
    try {
      await capi(`/vendor/inquiries/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function saveNote(id: number, note: string) {
    setBusyId(id);
    try {
      await capi(`/vendor/inquiries/${id}`, { method: 'PUT', body: JSON.stringify({ note }) });
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, note } : x)));
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="dash-head">
        <h1>Leads</h1>
        <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{total} total</span>
      </div>
      {error && <div className="form-msg error">{error}</div>}

      <div className="biz-cats" style={{ marginBottom: 16 }}>
        {['all', ...STATUSES].map((s) => (
          <span key={s} className="chip">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setFilter(s);
                setPage(1);
              }}
              style={{ color: filter === s ? '#fff' : undefined, background: filter === s ? 'var(--green)' : undefined, display: 'inline-block', borderRadius: 999 }}
            >
              {s === 'all' ? 'All' : LABELS[s]}
            </a>
          </span>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <h2>No leads yet</h2>
          <p>
            When a buyer taps “Enquire on WhatsApp” or sends a cart list, the lead lands here with
            the exact message they sent — even if they never hit send in WhatsApp, the enquiry is
            already yours.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((q) => (
            <div className="card panel" key={q.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <div>
                  <strong>{q.buyer_name || 'Buyer'}</strong>
                  {q.buyer_phone && <span style={{ color: 'var(--muted)', fontSize: '0.88rem' }}> · {q.buyer_phone}</span>}
                  <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                    {new Date(q.created_at).toLocaleString('en-NG')} · {q.source.replace('_', ' ')}
                    {q.item_name && q.source !== 'cart' ? ` · ${q.item_name}` : ''}
                    {q.variant_label ? ` · ${q.variant_label}` : ''}
                  </div>
                </div>
                <span className={`status-pill ${q.status}`}>{LABELS[q.status] ?? q.status}</span>
              </div>
              {q.source === 'cart' && Array.isArray(q.items) && q.items.length > 0 && (
                <ul className="lead-items">
                  {q.items.map((it) => (
                    <li key={it.listing_id}>
                      <span>
                        {it.name} × {it.quantity}
                      </span>
                      {it.url && (
                        <a href={it.url} target="_blank" rel="noopener">
                          view
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {q.message && (
                <p style={{ whiteSpace: 'pre-line', fontSize: '0.92rem', background: 'var(--bg)', borderRadius: 10, padding: '10px 12px', margin: '10px 0' }}>
                  {q.message}
                </p>
              )}
              {q.wa_url && (
                <a className="mini-btn" href={q.wa_url} target="_blank" rel="noopener">
                  Open WhatsApp chat ↗
                </a>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <select className="select" style={{ width: 'auto' }} defaultValue={q.status} onChange={(e) => setStatus(q.id, e.target.value)} disabled={busyId === q.id}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {LABELS[s]}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 180 }}
                  placeholder="Add a note (optional)"
                  defaultValue={q.note ?? ''}
                  key={`${q.id}-${q.note ?? ''}`}
                  onBlur={(e) => {
                    if (e.target.value !== (q.note ?? '')) saveNote(q.id, e.target.value);
                  }}
                />
                <label className="field" style={{ margin: 0, minWidth: 200 }}>
                  Follow up
                  <input
                    className="input"
                    type="datetime-local"
                    defaultValue={q.follow_up_at ? q.follow_up_at.slice(0, 16) : ''}
                    onBlur={async (e) => {
                      const value = e.target.value;
                      try {
                        await capi(`/vendor/inquiries/${q.id}`, { method: 'PUT', body: JSON.stringify({ follow_up_at: value ? new Date(value).toISOString() : null }) });
                      } catch (err) {
                        setError(extractError(err));
                      }
                    }}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="pager">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <a key={p} href="#" className={p === page ? 'current' : ''} onClick={(e) => { e.preventDefault(); setPage(p); }}>
              {p}
            </a>
          ))}
        </div>
      )}
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 18 }}>
        Tip: reply fast — leads converted within the first hour are the ones that stick. <Link href="/dashboard/whatsapp">Check your WhatsApp numbers</Link> are all active.
      </p>
    </div>
  );
}
