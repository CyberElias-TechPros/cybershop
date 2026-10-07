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
  // Set when the password was right but this account has a second factor. The
  // password step is done; we are waiting on the phone.
  const [mfa, setMfa] = useState(false);
  const [code, setCode] = useState('');

  async function finish() {
    const me = await capi<{ user: { role: string } }>('/auth/me');
      const next = new URLSearchParams(window.location.search).get('next');
      const fallback = me.user.role === 'admin' ? '/admin' : me.user.role === 'vendor' ? '/dashboard' : '/account';
      const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
      router.push(dest);
      router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await capi<{ mfa_required?: boolean }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      if (d.mfa_required) {
        setMfa(true);
        setBusy(false);
        return;
      }
      await finish();
    } catch (err) {
      setError(extractError(err));
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await capi('/auth/login/2fa', { method: 'POST', body: JSON.stringify({ code }) });
      await finish();
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
      lede={
        mfa
          ? 'One more step: the six-digit code that is showing in your authenticator app right now.'
          : 'The market never closed. Your catalogue kept its lights on, your leads kept their questions — pick up the thread.'
      }
      head={{
        kicker: mfa ? 'Two-factor authentication' : 'Buyers, vendors & house',
        title: mfa ? 'Enter your code' : 'Sign in',
        sub: mfa ? 'Your password is confirmed. Prove it is really you.' : 'Your account, your stall, or the market itself.',
      }}
    >
      {error && (
        <div className="form-msg error" style={{ ['--i' as string]: 0.5 }} role="alert">
          {error}
        </div>
      )}
      {mfa ? (
        <form onSubmit={submitCode}>
          <div className="field" style={{ ['--i' as string]: 1 }}>
            <label htmlFor="code">Code from your authenticator app</label>
            <input
              id="code"
              className="input totp-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              autoFocus
            />
            <div className="hint">
              Lost your phone? Enter one of your recovery codes (e.g. <code>A1B2C-D3E4F</code>).
            </div>
          </div>
          <div className="form-actions" style={{ ['--i' as string]: 2 }}>
            <button className="btn btn-primary" type="submit" disabled={busy || code.length < 6}>
              {busy ? 'Checking…' : 'Verify and sign in'}
            </button>
          </div>
        </form>
      ) : (
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
      )}
      <p className="auth-alt" style={{ ['--i' as string]: 4 }}>
        New here?{' '}
        <Link href="/register">Open your storefront free</Link>
      </p>
    </AuthShell>
  );
}
