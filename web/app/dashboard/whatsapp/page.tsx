'use client';

import { useCallback, useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface WaNumber {
  id: number;
  number: string;
  label: string;
  is_default: number;
  status: string;
  created_at: string;
  route_category_id: number | null;
  route_item_type_id: number | null;
}
interface RouteOpt { id: number; name: string }

export default function WhatsAppPage() {
  const [numbers, setNumbers] = useState<WaNumber[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const [num, setNum] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cats, setCats] = useState<RouteOpt[]>([]);
  const [types, setTypes] = useState<RouteOpt[]>([]);

  const load = useCallback(async () => {
    try {
      const d = await capi<{ numbers: WaNumber[]; limit: number }>('/vendor/whatsapp');
      setNumbers(d.numbers);
      setLimit(d.limit);
      const meta = await capi<{ categories: RouteOpt[]; types: RouteOpt[] }>('/vendor/item-types');
      setCats(meta.categories);
      setTypes(meta.types);
    } catch (e) {
      setError(extractError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await capi('/vendor/whatsapp', { method: 'POST', body: JSON.stringify({ number: num, label }) });
      setNum('');
      setLabel('');
      setNotice('Number added.');
      await load();
    } catch (e2) {
      setError(extractError(e2));
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(id: number) {
    setBusy(true);
    try {
      await capi(`/vendor/whatsapp/${id}`, { method: 'PUT', body: JSON.stringify({ is_default: true }) });
      setNotice('Default number updated.');
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm('Remove this number? Items that use it will fall back to your default number.')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await capi<{ message?: string }>(`/vendor/whatsapp/${id}`, { method: 'DELETE' });
      setNotice(r.message ?? 'Number removed.');
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
        <h1>WhatsApp numbers</h1>
      </div>
      {error && <div className="form-msg error">{error}</div>}
      {notice && <div className="form-msg success">{notice}</div>}

      <div className="card panel">
        <h2 style={{ fontSize: '1.05rem' }}>
          Add a number <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.85rem' }}>({numbers.length}/{limit === null ? '?' : limit} on your plan)</span>
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: -6 }}>
          Buyers reach the number pinned on the item, then a number routed to that item type, then a number routed to that category, then your store default. Extra numbers are an add-on on paid plans.
        </p>
        <form onSubmit={add} className="form-row" style={{ alignItems: 'end' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="wa-num">Number</label>
            <input id="wa-num" className="input" required placeholder="0803 123 4567" value={num} onChange={(e) => setNum(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="wa-label">Label (optional)</label>
            <input id="wa-label" className="input" placeholder="e.g. Sales" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ marginBottom: 0 }}>
            {busy ? 'Adding…' : 'Add'}
          </button>
        </form>
      </div>

      {numbers.length === 0 ? (
        <div className="empty">
          <h2>No numbers yet</h2>
          <p>Add at least one active number so buyers can reach you on WhatsApp.</p>
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Number</th>
                <th>Label</th>
                <th>Status</th>
                <th>Routes to</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {numbers.map((n) => (
                <tr key={n.id}>
                  <td>
                    {n.number}
                    {n.is_default ? <span className="chip" style={{ marginLeft: 8 }}>default</span> : null}
                  </td>
                  <td>{n.label || '—'}</td>
                  <td>
                    <span className={`status-pill ${n.status === 'active' ? 'active' : 'suspended'}`}>{n.status}</span>
                  </td>
                  <td>
                    <select
                      className="select"
                      aria-label={`Category route for ${n.number}`}
                      defaultValue={n.route_category_id ?? ''}
                      onChange={async (e) => {
                        const value = e.target.value;
                        try {
                          await capi(`/vendor/whatsapp/${n.id}`, { method: 'PUT', body: JSON.stringify({ route_category_id: value ? Number(value) : null }) });
                          setNotice('Routing updated.');
                        } catch (err) { setError(extractError(err)); }
                      }}
                    >
                      <option value="">Any category</option>
                      {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select
                      className="select"
                      aria-label={`Item type route for ${n.number}`}
                      defaultValue={n.route_item_type_id ?? ''}
                      onChange={async (e) => {
                        const value = e.target.value;
                        try {
                          await capi(`/vendor/whatsapp/${n.id}`, { method: 'PUT', body: JSON.stringify({ route_item_type_id: value ? Number(value) : null }) });
                          setNotice('Routing updated.');
                        } catch (err) { setError(extractError(err)); }
                      }}
                    >
                      <option value="">Any type</option>
                      {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <div className="row-actions">
                      {!n.is_default && (
                        <button className="mini-btn" onClick={() => setDefault(n.id)} disabled={busy}>
                          Set default
                        </button>
                      )}
                      <button className="mini-btn danger" onClick={() => remove(n.id)} disabled={busy}>
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
