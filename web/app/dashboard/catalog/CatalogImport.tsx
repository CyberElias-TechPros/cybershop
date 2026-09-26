'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { capi, extractError } from '@/lib/client-api';

export default function CatalogImport() {
  const router = useRouter();
  const [csv, setCsv] = useState('name,price_naira,price_type,category,description\nAnkara set,25000,fixed,fashion,Ready to wear');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <details className="card panel" style={{ marginBottom: 16 }}>
      <summary style={{ cursor: 'pointer' }}>Import a CSV (drafts)</summary>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        Header row required. Columns: name, price_naira, price_type (fixed, from, negotiable, free), category, item_type, description. Max 200 rows. Imports land as drafts so you can add photos before they go live.
      </p>
      {error && <div className="form-msg error">{error}</div>}
      {msg && <div className="form-msg success" role="status">{msg}</div>}
      <textarea className="textarea" value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} aria-label="CSV" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          className="btn btn-primary"
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            setMsg('');
            try {
              const r = await capi<{ created: number; errors: { row: number; message: string }[] }>('/vendor/catalog/import', {
                method: 'POST',
                body: JSON.stringify({ csv }),
              });
              setMsg(`Created ${r.created} draft${r.created === 1 ? '' : 's'}${r.errors?.length ? `. ${r.errors.length} row(s) skipped.` : '.'}`);
              router.refresh();
            } catch (e) {
              setError(extractError(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Importing…' : 'Import as drafts'}
        </button>
        <a className="btn btn-ghost" href="/api/vendor/items/export">Download current catalogue</a>
      </div>
    </details>
  );
}
