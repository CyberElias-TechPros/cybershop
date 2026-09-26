'use client';

import { useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

export default function DomainPage() {
  const [domain, setDomain] = useState('');
  const [status, setStatus] = useState('none');
  const [token, setToken] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [addon, setAddon] = useState(false);
  const [instructions, setInstructions] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const d = await capi<{ addon: boolean; domain: string | null; status: string; token: string | null; instructions: string | null }>('/vendor/domain');
    setAddon(d.addon);
    setCurrent(d.domain);
    setStatus(d.status);
    setToken(d.token);
    setInstructions(d.instructions);
    if (d.domain) setDomain(d.domain);
  }
  useEffect(() => { load().catch((e) => setError(extractError(e))); }, []);

  return (
    <div>
      <div className="dash-head"><h1>Custom domain</h1></div>
      <p style={{ color: 'var(--muted)' }}>
        Your storefront can live on your own host, like shop.yourbrand.ng. DNS verification works without extra keys. TLS is attached automatically only when VERCEL_TOKEN and VERCEL_PROJECT_ID are set — otherwise add the domain in the Vercel project after it verifies.
      </p>
      {error && <div className="form-msg error">{error}</div>}
      {msg && <div className="form-msg success" role="status">{msg}</div>}
      {!addon && <div className="banner warn">Buy the Custom domain add-on under Plan & billing first.</div>}
      <form
        className="card panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          try {
            const r = await capi<{ token: string; status: string }>('/vendor/domain', { method: 'POST', body: JSON.stringify({ domain }) });
            setToken(r.token);
            setStatus(r.status);
            setMsg('Domain saved. Add the TXT record, then check.');
            await load();
          } catch (err) { setError(extractError(err)); }
        }}
      >
        <label className="field">Domain<input className="input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="shop.yourbrand.ng" required /></label>
        <button className="btn btn-primary" type="submit" disabled={!addon}>Save domain</button>
        <button
          className="btn btn-ghost"
          type="button"
          style={{ marginLeft: 8 }}
          onClick={async () => {
            try {
              const r = await capi<{ verified: boolean; message: string }>('/vendor/domain/check', { method: 'POST', body: '{}' });
              setMsg(r.message);
              await load();
            } catch (err) { setError(extractError(err)); }
          }}
        >
          Check DNS
        </button>
      </form>
      <p>Status: <strong>{status}</strong>{current ? ` · ${current}` : ''}</p>
      {token && <p style={{ wordBreak: 'break-all' }}>Token: {token}</p>}
      {instructions && <p>{instructions}</p>}
    </div>
  );
}
