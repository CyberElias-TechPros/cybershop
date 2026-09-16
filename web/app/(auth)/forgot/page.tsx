'use client';

import Link from 'next/link';
import { useState } from 'react';
import { capi, extractError } from '@/lib/client-api';
import AuthShell from '@/components/AuthShell';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<null | { message: string; devUrl?: string }>(null);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const j = await capi<{ message: string; dev_mode?: boolean; reset_url?: string }>('/auth/forgot', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSent({ message: j.message, devUrl: j.dev_mode ? j.reset_url : undefined });
    } catch (err) {
      setError(extractError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      kicker="The WhatsApp-first night market · always open"
      title={
        <>
          Locked out of <em>your stall?</em>
        </>
      }
      lede="It happens to every market trader eventually. Tell us your email and we'll hand you a fresh key — single-use, valid for one hour."
      head={{ kicker: 'Account recovery', title: 'Reset your password', sub: 'We’ll send a reset link to your email.' }}
    >
      {error && (
        <div className="form-msg error" style={{ ['--i' as string]: 0.5 }} role="alert">
          {error}
        </div>
      )}
      {sent ? (
        <>
          <div className="form-msg success" style={{ ['--i' as string]: 0.6 }}>{sent.message}</div>
          {sent.devUrl && (
            <p style={{ fontSize: '0.9rem', ['--i' as string]: 0.7 }}>
              (Dev mode — no email service configured. Your reset link: <a href={sent.devUrl}>{sent.devUrl}</a>)
            </p>
          )}
        </>
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
          <div className="form-actions" style={{ ['--i' as string]: 2 }}>
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%' }}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          </div>
        </form>
      )}
      <p className="auth-alt" style={{ ['--i' as string]: 3 }}>
        <Link href="/login">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
