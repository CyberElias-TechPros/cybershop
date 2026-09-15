'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';
import AuthShell from '@/components/AuthShell';

function ResetInner() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await capi('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) });
      setDone(true);
      setTimeout(() => router.push('/login'), 1500);
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
          A fresh key for <em>your stall.</em>
        </>
      }
      lede="Choose something you'll remember tomorrow — the market reopens the moment you're back in."
      head={{ kicker: 'Account recovery', title: 'Choose a new password', sub: 'Your reset link is single-use and expires in an hour.' }}
    >
      {error && (
        <div className="form-msg error" style={{ ['--i' as string]: 0.5 }} role="alert">
          {error}
        </div>
      )}
      {done ? (
        <div className="form-msg success" style={{ ['--i' as string]: 0.6 }}>
          Password updated — taking you to sign in…
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="field" style={{ ['--i' as string]: 1 }}>
            <label htmlFor="password">New password</label>
            <input id="password" className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="••••••••••••" />
          </div>
          <div className="field" style={{ ['--i' as string]: 2 }}>
            <label htmlFor="confirm">Confirm new password</label>
            <input id="confirm" className="input" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" placeholder="••••••••••••" />
          </div>
          <div className="form-actions" style={{ ['--i' as string]: 3 }}>
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%' }}>
              {busy ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetInner />
    </Suspense>
  );
}
