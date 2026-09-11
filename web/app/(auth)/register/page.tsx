'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Cat {
  name: string;
  slug: string;
  icon: string | null;
}

/**
 * Onboarding step 1 — account + business basics.
 * Plan selection + payment happen on /onboarding (next screen).
 */
export default function RegisterPage() {
  const router = useRouter();
  const [cats, setCats] = useState<Cat[]>([]);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    business_name: '',
    category_slug: '',
    whatsapp_number: '',
    city: '',
    state_region: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadCats() {
    try {
      const res = await fetch('/api/public/home', { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        if (Array.isArray(j.categories)) setCats(j.categories);
      }
    } catch {
      /* categories are optional for the form */
    }
  }
  loadCats();

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await capi('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ role: 'vendor', ...form }),
      });
      router.push('/onboarding');
    } catch (err) {
      setError(extractError(err));
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap" style={{ alignItems: 'flex-start', paddingTop: 40 }}>
      <div className="card auth-card" style={{ maxWidth: 560 }}>
        <h1>Create your business account</h1>
        <p className="sub">
          Free to start — list your business, publish a catalogue, and let buyers reach you on
          WhatsApp. You’ll pick a plan on the next step.
        </p>
        {error && <div className="form-msg error">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-row">
            <div className="field">
              <label htmlFor="name">Your name</label>
              <input id="name" className="input" required minLength={2} maxLength={120} value={form.name} onChange={set('name')} autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" className="input" type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" className="input" type="password" required minLength={8} value={form.password} onChange={set('password')} autoComplete="new-password" />
            <div className="hint">At least 8 characters.</div>
          </div>
          <div className="field">
            <label htmlFor="business_name">Business name</label>
            <input id="business_name" className="input" required minLength={2} maxLength={120} placeholder="e.g. Ada Tech Academy" value={form.business_name} onChange={set('business_name')} />
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="category">What do you offer?</label>
              <select id="category" className="select" required value={form.category_slug} onChange={set('category_slug')}>
                <option value="" disabled>
                  Choose a category…
                </option>
                {cats.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.icon ? `${c.icon} ` : ''}
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="wa">WhatsApp number</label>
              <input id="wa" className="input" required placeholder="0803 123 4567" value={form.whatsapp_number} onChange={set('whatsapp_number')} autoComplete="tel" />
              <div className="hint">Buyers will message this number.</div>
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="city">City</label>
              <input id="city" className="input" value={form.city} onChange={set('city')} />
            </div>
            <div className="field">
              <label htmlFor="state">State</label>
              <input id="state" className="input" value={form.state_region} onChange={set('state_region')} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%' }}>
              {busy ? 'Creating your account…' : 'Continue — choose a plan'}
            </button>
          </div>
        </form>
        <p className="auth-alt">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
