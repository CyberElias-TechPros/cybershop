'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { capi, extractError } from '@/lib/client-api';

interface Business {
  name: string;
  slug: string;
  about: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state_region: string | null;
  website: string | null;
  social: string | null;
  status: string;
  categories: { name: string; slug: string }[];
}

const SOCIAL_KEYS = [
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
  ['x', 'X (Twitter)'],
  ['threads', 'Threads'],
  ['tiktok', 'TikTok'],
  ['youtube', 'YouTube'],
] as const;

export default function SettingsPage() {
  const [biz, setBiz] = useState<Business | null>(null);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    about: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state_region: '',
    website: '',
    social: {} as Record<string, string>,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await capi<{ business: Business }>('/vendor/business');
      setBiz(d.business);
      let social: Record<string, string> = {};
      try {
        social = JSON.parse(d.business.social || '{}');
      } catch {
        social = {};
      }
      setForm({
        name: d.business.name,
        slug: d.business.slug,
        about: d.business.about ?? '',
        phone: d.business.phone ?? '',
        email: d.business.email ?? '',
        address: d.business.address ?? '',
        city: d.business.city ?? '',
        state_region: d.business.state_region ?? '',
        website: d.business.website ?? '',
        social,
      });
    } catch (e) {
      setError(extractError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await capi('/vendor/business', { method: 'PUT', body: JSON.stringify(form) });
      setNotice('Saved.');
      await load();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!biz) {
    return (
      <div>
        <div className="dash-head">
          <h1>Settings</h1>
        </div>
        {error ? <div className="form-msg error">{error}</div> : <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="dash-head">
        <h1>Settings</h1>
        <Link className="btn btn-ghost" href={`/business/${biz.slug}`}>
          View store ↗
        </Link>
      </div>
      {error && <div className="form-msg error">{error}</div>}
      {notice && <div className="form-msg success">{notice}</div>}

      <form onSubmit={save}>
        <div className="card panel">
          <h2 style={{ fontSize: '1.05rem' }}>Store profile</h2>
          <div className="field">
            <label htmlFor="s-name">Store name</label>
            <input id="s-name" className="input" required minLength={2} maxLength={160} value={form.name} onChange={set('name')} />
          </div>
          <div className="field">
            <label htmlFor="s-slug">Store URL</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ alignSelf: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>/business/</span>
              <input id="s-slug" className="input" required minLength={2} maxLength={170} value={form.slug} onChange={set('slug')} />
            </div>
            <div className="hint">Short and memorable — e.g. cyber-elias-academy</div>
          </div>
          <div className="field">
            <label htmlFor="s-about">About your business</label>
            <textarea id="s-about" className="textarea" maxLength={5000} value={form.about} onChange={set('about')} placeholder="Who are you, what do you do, why should buyers trust you?" />
            <div className="hint">Shown on your storefront and used for the WhatsApp preview description.</div>
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="s-phone">Phone</label>
              <input id="s-phone" className="input" value={form.phone} onChange={set('phone')} />
            </div>
            <div className="field">
              <label htmlFor="s-email">Contact email</label>
              <input id="s-email" className="input" type="email" value={form.email} onChange={set('email')} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="s-address">Street address (optional)</label>
            <input id="s-address" className="input" value={form.address} onChange={set('address')} />
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="s-city">City</label>
              <input id="s-city" className="input" value={form.city} onChange={set('city')} />
            </div>
            <div className="field">
              <label htmlFor="s-state">State</label>
              <input id="s-state" className="input" value={form.state_region} onChange={set('state_region')} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="s-web">Website (optional)</label>
            <input id="s-web" className="input" type="url" placeholder="https://" value={form.website} onChange={set('website')} />
          </div>
        </div>

        <div className="card panel">
          <h2 style={{ fontSize: '1.05rem' }}>Social links</h2>
          {SOCIAL_KEYS.map(([k, label]) => (
            <div className="field" key={k}>
              <label htmlFor={`s-${k}`}>{label}</label>
              <input
                id={`s-${k}`}
                className="input"
                type="url"
                placeholder="https://"
                value={form.social[k] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, social: { ...f.social, [k]: e.target.value } }))}
              />
            </div>
          ))}
        </div>

        <div className="card panel">
          <h2 style={{ fontSize: '1.05rem' }}>Categories</h2>
          <div className="biz-cats">
            {biz.categories.map((c) => (
              <span className="chip" key={c.slug}>
                {c.name}
              </span>
            ))}
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            Categories are managed by the platform team. Need a new one for your business?{' '}
            <Link href="mailto:support@cybershop.ng">Let us know</Link>.
          </p>
        </div>

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
