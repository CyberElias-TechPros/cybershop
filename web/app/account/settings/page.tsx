'use client';

import { useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

export default function AccountSettings() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [closePw, setClosePw] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [blocks, setBlocks] = useState<{ id: number; name: string; slug: string }[]>([]);

  useEffect(() => {
    Promise.all([
      capi<{ user: { name: string; email: string; phone: string | null } }>('/account/home'),
      capi<{ blocks: { id: number; name: string; slug: string }[] }>('/account/blocks'),
    ]).then(([h, b]) => {
      setName(h.user.name);
      setEmail(h.user.email);
      setPhone(h.user.phone || '');
      setBlocks(b.blocks);
    }).catch((e) => setError(extractError(e)));
  }, []);

  return (
    <div>
      <div className="dash-head"><h1>Account settings</h1></div>
      {error && <div className="form-msg error">{error}</div>}
      {msg && <div className="form-msg success" role="status">{msg}</div>}

      <form
        className="card panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          try {
            await capi('/account/profile', { method: 'PUT', body: JSON.stringify({ name, phone: phone || null }) });
            setMsg('Profile saved.');
          } catch (err) { setError(extractError(err)); }
        }}
      >
        <h2 style={{ fontSize: '1.05rem' }}>Profile</h2>
        <p style={{ color: 'var(--muted)' }}>{email}</p>
        <label className="field">Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></label>
        <label className="field">Phone<input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <button className="btn btn-primary" type="submit">Save</button>
        <button
          className="btn btn-ghost"
          type="button"
          style={{ marginLeft: 8 }}
          onClick={async () => {
            try {
              const r = await capi<{ message?: string; verify_url?: string }>('/account/verify-email/request', { method: 'POST', body: '{}' });
              setMsg(r.verify_url ? `Dev link: ${r.verify_url}` : r.message || 'Confirmation sent.');
            } catch (err) { setError(extractError(err)); }
          }}
        >
          Confirm email
        </button>
      </form>

      <form
        className="card panel"
        style={{ marginTop: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const r = await capi<{ message: string }>('/account/password', { method: 'POST', body: JSON.stringify({ current, password }) });
            setMsg(r.message);
          } catch (err) { setError(extractError(err)); }
        }}
      >
        <h2 style={{ fontSize: '1.05rem' }}>Change password</h2>
        <label className="field">Current<input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></label>
        <label className="field">New<input className="input" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button className="btn btn-primary" type="submit">Update password</button>
      </form>

      <section className="card panel" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: '1.05rem' }}>Blocked sellers</h2>
        {blocks.length === 0 ? <p style={{ color: 'var(--muted)' }}>You have not blocked anyone.</p> : (
          <ul>
            {blocks.map((b) => (
              <li key={b.id}>
                {b.name}{' '}
                <button type="button" className="mini-btn" onClick={async () => {
                  await capi(`/account/blocks/${b.id}`, { method: 'DELETE' });
                  setBlocks((xs) => xs.filter((x) => x.id !== b.id));
                }}>Unblock</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card panel" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: '1.05rem' }}>Your data</h2>
        <p style={{ color: 'var(--muted)' }}>Download a copy, or close the account. Closing unpublishes a store you own. Payment records stay for bookkeeping.</p>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={async () => {
            const r = await capi<{ export: unknown }>('/account/export');
            const blob = new Blob([JSON.stringify(r.export, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'cybershop-data.json';
            a.click();
          }}
        >
          Download my data
        </button>
      </section>

      <form
        className="card panel"
        style={{ marginTop: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!confirm('Close this account? This cannot be undone from the site.')) return;
          try {
            const r = await capi<{ message: string }>('/account/close', { method: 'POST', body: JSON.stringify({ password: closePw }) });
            window.location.href = '/';
            setMsg(r.message);
          } catch (err) { setError(extractError(err)); }
        }}
      >
        <h2 style={{ fontSize: '1.05rem' }}>Close account</h2>
        <label className="field">Password<input className="input" type="password" value={closePw} onChange={(e) => setClosePw(e.target.value)} required /></label>
        <button className="btn btn-ghost" type="submit">Close my account</button>
      </form>
    </div>
  );
}
