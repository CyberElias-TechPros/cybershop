'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { capi, extractError } from '@/lib/client-api';
import AuthShell from '@/components/AuthShell';

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
      router.refresh();
    } catch (err) {
      setError(extractError(err));
      setBusy(false);
    }
  }

  return (
    <AuthShell
      kicker="The WhatsApp-first night market · always open"
      title={
        <>
          Welcome back to <em>your stall.</em>
        </>
      }
      lede="The market never closed. Your catalogue kept its lights on, your leads kept their questions — pick up the thread."
      head={{ kicker: 'Vendors & house', title: 'Sign in', sub: 'Tend your stall — or the market itself.' }}
    >
      {error && (
        <div className="form-msg error" style={{ ['--i' as string]: 0.5 }} role="alert">
          {error}
        </div>
      )}
      <form onSubmit={submit}>
        <div className="field" style={{ ['--i' as string]: 1 }}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@business.ng"
          />
        </div>
        <div className="field" style={{ ['--i' as string]: 2 }}>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••••••"
          />
          <div className="hint">
            <Link href="/forgot">Forgot your password?</Link>
          </div>
        </div>
        <div className="form-actions" style={{ ['--i' as string]: 3 }}>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
      <p className="auth-alt" style={{ ['--i' as string]: 4 }}>
        New here?{' '}
        <Link href="/register">Open your storefront free</Link>
      </p>
    </AuthShell>
  );
}
