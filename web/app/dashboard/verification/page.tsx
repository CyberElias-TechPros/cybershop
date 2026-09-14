'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { capi, extractError } from '@/lib/client-api';

export default function VerificationPage() {
  const [status, setStatus] = useState('unverified');
  const [addon, setAddon] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [requests, setRequests] = useState<{ id: number; status: string; review_note: string | null; created_at: string }[]>([]);

  const load = useCallback(async () => {
    try {
      const d = await capi<{ verification_status: string; addon: boolean; requests: { id: number; status: string; review_note: string | null; created_at: string }[] }>('/vendor/verification');
      setStatus(d.verification_status);
      setAddon(d.addon);
      setRequests(d.requests);
    } catch (e) {
      setError(extractError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const r = await capi<{ message?: string }>('/vendor/verification', { method: 'POST', body: JSON.stringify({ note }) });
      setNotice(r.message || 'Submitted.');
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="dash-head">
        <h1>Verified ID</h1>
      </div>
      {error && <div className="form-msg error">{error}</div>}
      {notice && <div className="form-msg success">{notice}</div>}
      <div className="card panel">
        <p>
          Status: <span className={`status-pill ${status}`}>{status}</span>
        </p>
        <p style={{ color: 'var(--muted)', fontSize: '0.92rem' }}>
          Paying for Verified ID does not auto-approve you. An admin reviews your ID. The badge lasts while the add-on is active.
        </p>
        {!addon ? (
          <Link className="btn btn-primary" href="/dashboard/billing">
            Buy Verified ID
          </Link>
        ) : status === 'verified' ? (
          <p>Your ads show a Verified ID badge.</p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="kyc">Note for reviewers (ID type, full name as on ID)</label>
              <textarea id="kyc" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <p className="hint">Upload a clear photo of your government ID on the Media page first if you want it attached later. For now a written note is enough for review.</p>
            <button className="btn btn-primary" type="button" onClick={submit} disabled={busy}>
              {busy ? 'Submitting…' : 'Submit for review'}
            </button>
          </>
        )}
      </div>
      {requests.length > 0 && (
        <div className="card panel">
          <h2 style={{ fontSize: '1.05rem' }}>Requests</h2>
          {requests.map((r) => (
            <div key={r.id} className="kv">
              <span className="k">{new Date(r.created_at).toLocaleDateString('en-NG')}</span>
              <span className="v">
                {r.status}
                {r.review_note ? ` — ${r.review_note}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
