'use client';

import Link from 'next/link';
import { useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

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
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>Reset your password</h1>
        <p className="sub">Enter your account email and we’ll send you a reset link.</p>
        {error && <div className="form-msg error">{error}</div>}
        {sent ? (
          <>
            <div className="form-msg success">{sent.message}</div>
            {sent.devUrl && (
              <p style={{ fontSize: '0.9rem' }}>
                (Dev mode — no email service configured. Your reset link: <a href={sent.devUrl}>{sent.devUrl}</a>)
              </p>
            )}
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%' }}>
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
            </div>
          </form>
        )}
        <p className="auth-alt">
          <Link href="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
