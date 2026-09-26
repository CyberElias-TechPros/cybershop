'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { capi, extractError } from '@/lib/client-api';

export default function InvitePage() {
  const token = String(useParams().token || '');
  const router = useRouter();
  const [preview, setPreview] = useState<{ business_name: string; role: string; email_masked: string; expired: boolean } | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    capi<NonNullable<typeof preview>>(`/auth/invites/${token}`).then(setPreview).catch((e) => setError(extractError(e)));
  }, [token]);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await capi('/auth/invites/accept', { method: 'POST', body: JSON.stringify({ token, name: name || undefined, password: password || undefined }) });
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      const message = extractError(err);
      if (message.toLowerCase().includes('sign in')) {
        router.push(`/login?next=/invite/${token}`);
        return;
      }
      setError(message);
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 520 }}>
        <h1>Join a store</h1>
        {error && <div className="form-msg error" role="alert">{error}</div>}
        {preview && (
          <>
            <p>{preview.business_name} invited {preview.email_masked} as <strong>{preview.role}</strong>.</p>
            {preview.expired ? <p>This invite has expired. Ask the owner for a new one.</p> : (
              <form className="card panel" onSubmit={accept}>
                <p style={{ color: 'var(--muted)' }}>New here? Set a name and password. Already have this email? Sign in first, then open the link again.</p>
                <label className="field">Your name<input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
                <label className="field">Password<input className="input" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
                <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Joining…' : 'Accept invite'}</button>
              </form>
            )}
          </>
        )}
      </div>
    </section>
  );
}
