'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await capi('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      router.push('/dashboard');
    } catch (err) {
      setError(extractError(err));
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <p className="cine-kicker" style={{ marginBottom: 10 }}>
          Vendors &amp; house
        </p>
        <h1>Welcome back</h1>
        <p className="sub">Sign in to tend your stall — or the market itself.</p>
        {error && <div className="form-msg error">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            <div className="hint">
              <a href="/forgot">Forgot your password?</a>
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>
        <p className="auth-alt">
          New here? <Link href="/register">Create a free business account</Link>
        </p>
      </div>
    </div>
  );
}
