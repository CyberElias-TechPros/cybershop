'use client';

import { useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

/**
 * Support, tracked: the form opens a ticket (guests welcome) that the
 * team answers in the admin queue; signed-in users follow the thread
 * under Account → Support tickets. Email stays available as a fallback.
 */
export default function ContactClient({ supportEmail }: { supportEmail: string }) {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await capi<{ ticket_id: number }>('/public/support', { method: 'POST', body: JSON.stringify(form) });
      setDone(r.ticket_id);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(supportEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  }

  if (done) {
    return (
      <div className="contact-card card panel" role="status">
        <h2>Ticket #{done} opened ✓</h2>
        <p>
          A person will reply — signed-in users can follow the thread under{' '}
          <a href="/account/support">Account → Support tickets</a>. Keep your ticket number.
        </p>
      </div>
    );
  }

  return (
    <div className="contact-card card panel">
      <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <label>Your name
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
          </label>
          <label>Email (for the reply)
            <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
          </label>
        </div>
        <label>Subject
          <input className="input" required minLength={3} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. My plan payment is pending" />
        </label>
        <label>What happened?
          <textarea className="textarea" required minLength={10} rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Include your store name (if you have one) and what you expected to happen." />
        </label>
        {error && <div className="form-msg error">{error}</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Open ticket'}</button>
          <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            Prefer email? <a href={`mailto:${supportEmail}`}>{supportEmail}</a>{' '}
            <button type="button" className="btn btn-ghost" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
          </span>
        </div>
      </form>
    </div>
  );
}
