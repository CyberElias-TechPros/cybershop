'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { capi, extractError } from '@/lib/client-api';

interface Session {
  id: string;
  current: boolean;
  device: string;
  created_at: string | null;
  last_activity: number;
}
interface TwoFaStatus {
  ok: boolean;
  enabled: boolean;
  enabled_at: string | null;
  backup_codes_left: number;
}

/**
 * Settings → Security.
 *
 * Two things a marketplace account needs that it did not have: a second factor
 * (an admin here can approve bank proofs and suspend stores — a password alone
 * should not be that powerful), and a list of devices signed in, so "is
 * somebody else in my account?" has an answer.
 */
export default function SecurityPage() {
  const [status, setStatus] = useState<TwoFaStatus | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // Enrolment state
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, sess] = await Promise.all([
        capi<TwoFaStatus>('/auth/2fa/status'),
        capi<{ sessions: Session[] }>('/auth/sessions'),
      ]);
      setStatus(s);
      setSessions(sess.sessions ?? []);
    } catch (e) {
      setError(extractError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function startSetup() {
    setBusy(true);
    setError('');
    try {
      const d = await capi<{ secret: string; uri: string }>('/auth/2fa/setup', { method: 'POST', body: '{}' });
      setSecret(d.secret);
      setUri(d.uri);
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup() {
    setBusy(true);
    setError('');
    try {
      const d = await capi<{ backup_codes: string[]; revoked_sessions: number }>('/auth/2fa/confirm', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      setBackupCodes(d.backup_codes);
      setSecret(null);
      setUri(null);
      setCode('');
      setNotice(`Two-factor is on. ${d.revoked_sessions} older session(s) were signed out.`);
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  async function disable2fa() {
    const password = prompt('Enter your password to turn off two-factor authentication:');
    if (!password) return;
    const twoFaCode = prompt('Enter the current 6-digit code (optional):', '');
    setBusy(true);
    setError('');
    try {
      await capi('/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ password, code: twoFaCode || undefined }) });
      setNotice('Two-factor authentication is off.');
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    setError('');
    try {
      await capi(`/auth/sessions/${id}/revoke`, { method: 'POST', body: '{}' });
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  async function revokeOthers() {
    if (!confirm('Sign out every other device signed in to this account?')) return;
    setBusy(true);
    setError('');
    try {
      const d = await capi<{ revoked: number }>('/auth/sessions/revoke-others', { method: 'POST', body: '{}' });
      setNotice(`${d.revoked} other session(s) signed out.`);
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  function copyCodes() {
    void navigator.clipboard?.writeText(backupCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div>
      <div className="dash-head">
        <h1>Security</h1>
        <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{sessions.length} signed-in device(s)</span>
      </div>
      {error && <div className="form-msg error">{error}</div>}
      {notice && <div className="form-msg success">{notice}</div>}

      {/* ---------------------------------------------------------- 2FA */}
      <div className="card panel">
        <h2 style={{ fontSize: '1.05rem' }}>Two-factor authentication</h2>
        {status?.enabled ? (
          <>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
              On since{' '}
              {status.enabled_at ? new Date(status.enabled_at).toLocaleDateString('en-NG') : 'recently'}. Signing in
              needs a six-digit code from your authenticator app as well as your password.
            </p>
            <p style={{ fontSize: '0.88rem' }}>
              <strong>{status.backup_codes_left}</strong> of 10 recovery codes left.
              {status.backup_codes_left <= 3 && ' Turn 2FA off and on again to issue a fresh set — they are the only way back in if you lose your phone.'}
            </p>
            <div className="row-actions">
              <button className="mini-btn danger" disabled={busy} onClick={disable2fa}>
                Turn off
              </button>
            </div>
          </>
        ) : secret ? (
          <>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
              Add this to Google Authenticator, Authy, 1Password or Apple Passwords — any app that speaks TOTP. If you
              cannot scan, type the key instead.
            </p>
            <div className="qr-box">
              {/* Server-rendered QR so the secret never round-trips through our own storage. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(uri ?? '')}`}
                alt="QR code for your authenticator app"
                width={180}
                height={180}
              />
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Or type this key</div>
                <code className="totp-secret">{secret}</code>
              </div>
            </div>
            <label className="field">
              <span className="label">Code from your app</span>
              <input
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            <div className="form-actions">
              <button className="btn btn-primary" disabled={busy || code.length !== 6} onClick={confirmSetup}>
                Confirm and turn on
              </button>
              <button className="btn btn-ghost" onClick={() => { setSecret(null); setUri(null); }}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
              A password gets stolen in a breach you did not cause. A second factor from your phone does not. If this
              account can approve payments or change a store’s status, turn this on.
            </p>
            <button className="btn btn-primary" disabled={busy} onClick={startSetup}>
              Set up two-factor
            </button>
          </>
        )}
      </div>

      {/* ------------------------------------------------- recovery codes */}
      {backupCodes.length > 0 && (
        <div className="card panel">
          <h2 style={{ fontSize: '1.05rem' }}>Save your recovery codes</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: -6 }}>
            Each works once. They are the only way in if you lose your phone, and they are not shown again.
          </p>
          <ul className="backup-codes">
            {backupCodes.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={copyCodes}>
              {copied ? 'Copied ✓' : 'Copy all'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={async () => {
                const w = window.open('', '_blank');
                if (w) {
                  w.document.write(`<pre style="font:14px monospace;padding:24px">${backupCodes.join('\n')}</pre>`);
                  w.document.close();
                }
              }}
            >
              Print
            </button>
            <button className="btn btn-ghost" onClick={() => setBackupCodes([])}>
              I have saved them
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------ devices */}
      <div className="card panel">
        <div className="dash-head" style={{ marginBottom: 6 }}>
          <h2 style={{ fontSize: '1.05rem' }}>Signed-in devices</h2>
          {sessions.length > 1 && (
            <button className="mini-btn danger" disabled={busy} onClick={revokeOthers}>
              Sign out other devices
            </button>
          )}
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -4 }}>
          Do not recognise one? Sign it out and <Link href="/contact">tell us</Link>.
        </p>
        <ul className="device-list">
          {sessions.map((s) => (
            <li key={s.id}>
              <div>
                <strong>{s.device}</strong>
                {s.current && <span className="sla-pill ok" style={{ marginLeft: 8 }}>this device</span>}
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  Last active{' '}
                  {new Date(s.last_activity * 1000).toLocaleString('en-NG')}
                  {s.created_at ? ` · signed in ${new Date(s.created_at).toLocaleDateString('en-NG')}` : ''}
                </div>
              </div>
              {!s.current && (
                <button className="mini-btn danger" disabled={busy} onClick={() => revoke(s.id)}>
                  Sign out
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
