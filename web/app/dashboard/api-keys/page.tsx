'use client';

import { useCallback, useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface KeyRow { id: number; name: string; key_prefix: string; last_used_at: string | null; created_at: string; revoked_at: string | null }

/** Read-only API keys: build on your own catalogue data. Secret shown once. */
export default function ApiKeysPage() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [name, setName] = useState('My integration');
  const [fresh, setFresh] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await capi<{ keys: KeyRow[] }>('/vendor/api-keys');
      setKeys(r.keys);
    } catch (e) { setError(extractError(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    setBusy(true); setError(''); setFresh('');
    try {
      const r = await capi<{ key: string }>('/vendor/api-keys', { method: 'POST', body: JSON.stringify({ name }) });
      setFresh(r.key);
      await load();
    } catch (e) { setError(extractError(e)); } finally { setBusy(false); }
  }

  async function revoke(id: number) {
    try { await capi(`/vendor/api-keys/${id}`, { method: 'DELETE' }); await load(); } catch (e) { setError(extractError(e)); }
  }

  return (
    <div>
      <div className="dash-head"><h1>API keys</h1></div>
      <p style={{ color: 'var(--muted)', maxWidth: 640 }}>
        Read-only access to your published catalogue for your own website or app:
        send <code>Authorization: Bearer csk_…</code> to <code>GET /api/public/catalog</code>.
        Keys are stored hashed and can be revoked instantly. The full guide is in{' '}
        <a href="/help/plans-and-billing">Help</a>.
      </p>
      {error && <div className="form-msg error">{error}</div>}
      {fresh && (
        <div className="banner warn" style={{ margin: '14px 0' }}>
          <div><strong>Copy your key now — it is shown once:</strong><br /><code style={{ wordBreak: 'break-all' }}>{fresh}</code></div>
        </div>
      )}
      <div className="card panel" style={{ margin: '16px 0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" style={{ maxWidth: 260 }} value={name} onChange={(e) => setName(e.target.value)} aria-label="Key name" />
        <button type="button" className="btn btn-primary" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create key'}</button>
      </div>
      <div className="card table-wrap">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Prefix</th><th>Created</th><th>Last used</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td><td><code>{k.key_prefix}…</code></td>
                <td>{new Date(k.created_at).toLocaleDateString()}</td>
                <td>{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}</td>
                <td>{k.revoked_at ? 'Revoked' : 'Active'}</td>
                <td>{!k.revoked_at && <button type="button" className="btn btn-ghost" onClick={() => revoke(k.id)}>Revoke</button>}</td>
              </tr>
            ))}
            {keys.length === 0 && <tr><td colSpan={6}>No keys yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
