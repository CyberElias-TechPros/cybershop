'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';
import AuthShell from '@/components/AuthShell';

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
    referral_code: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) setForm((f) => ({ ...f, referral_code: ref }));
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/public/home', { cache: 'no-store' });
        if (res.ok) {
          const j = await res.json();
          if (alive && Array.isArray(j.categories)) setCats(j.categories);
        }
      } catch {
        /* categories are optional for the form */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

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
    <AuthShell
      kicker="The WhatsApp-first night market · always open"
      title={
        <>
          Your business, <em>beautifully</em> found.
        </>
      }
      lede="A storefront with a living catalogue, in minutes. Buyers walk in, tap once, and the conversation starts on your WhatsApp — where deals actually close."
      head={{ kicker: 'Open a stall', title: 'Create your business account', sub: 'Free to start. You’ll pick a plan on the next step.' }}
    >
      {error && (
        <div className="form-msg error" style={{ ['--i' as string]: 0.5 }} role="alert">
          {error}
        </div>
      )}
      <form onSubmit={submit} className="auth-pane-wide">
        <div className="form-row">
          <div className="field" style={{ ['--i' as string]: 1 }}>
            <label htmlFor="name">Your name</label>
            <input id="name" className="input" required minLength={2} maxLength={120} value={form.name} onChange={set('name')} autoComplete="name" placeholder="Ada Obi" />
          </div>
          <div className="field" style={{ ['--i' as string]: 1 }}>
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" required value={form.email} onChange={set('email')} autoComplete="email" placeholder="you@business.ng" />
          </div>
        </div>
        <div className="field" style={{ ['--i' as string]: 2 }}>
          <label htmlFor="password">Password</label>
          <input id="password" className="input" type="password" required minLength={8} value={form.password} onChange={set('password')} autoComplete="new-password" placeholder="••••••••••••" />
          <div className="hint">At least 8 characters.</div>
        </div>
        <div className="field" style={{ ['--i' as string]: 3 }}>
          <label htmlFor="business_name">Business name</label>
          <input id="business_name" className="input" required minLength={2} maxLength={120} placeholder="e.g. Cyber Elias Academy" value={form.business_name} onChange={set('business_name')} />
        </div>
        <div className="form-row">
          <div className="field" style={{ ['--i' as string]: 4 }}>
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
          <div className="field" style={{ ['--i' as string]: 4 }}>
            <label htmlFor="wa">WhatsApp number</label>
            <input id="wa" className="input" required placeholder="0803 123 4567" value={form.whatsapp_number} onChange={set('whatsapp_number')} autoComplete="tel" />
            <div className="hint">Buyers will message this number.</div>
          </div>
        </div>
        <div className="form-row">
          <div className="field" style={{ ['--i' as string]: 5 }}>
            <label htmlFor="city">City</label>
            <input id="city" className="input" placeholder="Lagos" value={form.city} onChange={set('city')} />
          </div>
          <div className="field" style={{ ['--i' as string]: 5 }}>
            <label htmlFor="state">State</label>
            <input id="state" className="input" placeholder="Lagos" value={form.state_region} onChange={set('state_region')} />
          </div>
        </div>
        {form.referral_code && <p className="hint">Referral code {form.referral_code} will be applied. Credit is not cash.</p>}
        <div className="form-actions" style={{ ['--i' as string]: 6 }}>
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Creating your account…' : 'Continue — choose a plan'}
          </button>
        </div>
      </form>
      <p className="auth-alt" style={{ ['--i' as string]: 7 }}>
        Already have an account? <Link href="/login">Sign in</Link>
        <br />
        Just browsing? <Link href="/register/buyer">Create a free buyer account</Link>
      </p>
    </AuthShell>
  );
}
