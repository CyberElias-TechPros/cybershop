'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { capi, extractError } from '@/lib/client-api';

/** One-tap bulk actions over the listings on the current page. */
export default function BulkBar({ ids }: { ids: number[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [pct, setPct] = useState(-10);

  if (!ids.length) return null;

  async function run(label: string, payload: Record<string, unknown>) {
    setBusy(label);
    setMsg('');
    try {
      const r = await capi<{ changed: number }>('/vendor/items/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids, ...payload }),
      });
      setMsg(`Updated ${r.changed} listing${r.changed === 1 ? '' : 's'}.`);
      router.refresh();
    } catch (e) {
      setMsg(extractError(e));
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="card panel" style={{ marginBottom: 16 }} role="group" aria-label="Bulk actions for this page">
      <strong>Bulk actions — this page ({ids.length})</strong>
      {msg && <p role="status" style={{ margin: '8px 0' }}>{msg}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
        <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => run('in', { stock_status: 'in_stock' })}>Mark in stock</button>
        <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => run('out', { stock_status: 'out_of_stock' })}>Mark out of stock</button>
        <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => run('pub', { status: 'published' })}>Publish</button>
        <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => run('arc', { status: 'archived' })}>Archive</button>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input className="input" style={{ width: 84 }} type="number" value={pct} min={-90} max={500} onChange={(e) => setPct(Number(e.target.value))} aria-label="Price change percent" />
          <span>% prices</span>
          <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => run('pct', { price_percent: pct })}>Apply</button>
        </span>
      </div>
    </div>
  );
}
