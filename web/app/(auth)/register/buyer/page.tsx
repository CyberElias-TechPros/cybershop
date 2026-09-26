'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { capi, extractError } from '@/lib/client-api';
import AuthShell from '@/components/AuthShell';

export default function BuyerRegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await capi('/auth/register', { method: 'POST', body: JSON.stringify({ role: 'buyer', ...form, phone: form.phone || undefined }) });
      router.push('/account');
      router.refresh();
    } catch (err) {
      setError(extractError(err));
      setBusy(false);
    }
  }

  return (
    <AuthShell
      kicker="Browse first. Talk on WhatsApp."
      title={<>A quiet account, <em>when you want one.</em></>}
      lede="Guests can already browse and message sellers. An account keeps your saved ads, enquiries, and search alerts with you."
      head={{ kicker: 'Buyer account', title: 'Create a free account', sub: 'No checkout. No card. Sellers still reply on WhatsApp.' }}
    >
      {error && <div className="form-msg error" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="field"><label htmlFor="name">Your name</label><input id="name" className="input" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" /></div>
        <div className="field"><label htmlFor="email">Email</label><input id="email" className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" /></div>
        <div className="field"><label htmlFor="phone">Phone (optional)</label><input id="phone" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" /></div>
        <div className="field"><label htmlFor="password">Password</label><input id="password" className="input" type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></div>
        <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <p className="auth-alt">Selling instead? <Link href="/register">Open a storefront</Link></p>
    </AuthShell>
  );
}
