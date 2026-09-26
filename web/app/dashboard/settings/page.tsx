'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { capi, extractError } from '@/lib/client-api';
import ReferralCard from '@/components/ReferralCard';

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
  paused_at?: string | null;
  categories: { name: string; slug: string }[];
  storefront?: { style: string; accent: string; hours: string | null; sections: Record<string, boolean>; faq: { q: string; a: string }[] };
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
  const [style, setStyle] = useState('classic');
  const [accent, setAccent] = useState('');
  const [hours, setHours] = useState('');
  const [faq, setFaq] = useState('');
  const [sections, setSections] = useState<Record<string, boolean>>({ hero: true, featured: true, offers: true, about: true, faq: false, location: true });
  const [paused, setPaused] = useState(false);

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
      setPaused(!!d.business.paused_at);
      const sf = d.business.storefront;
      if (sf) {
        setStyle(sf.style || 'classic');
        setAccent(sf.accent || '');
        setHours(sf.hours || '');
        setSections({ ...sections, ...sf.sections });
        setFaq((sf.faq || []).map((row) => `${row.q} | ${row.a}`).join('\n'));
      }
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
      await capi('/vendor/business', { method: 'PUT', body: JSON.stringify({
        ...form,
        storefront: {
          style, accent, hours, sections,
          faq: faq.split('\n').map((line) => {
            const [q, ...rest] = line.split('|');
            return { q: (q || '').trim(), a: rest.join('|').trim() };
          }).filter((row) => row.q && row.a),
        },
      }) });
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
      <ReferralCard />
      {error && <div className="form-msg error">{error}</div>}
      {notice && <div className="form-msg success">{notice}</div>}

      <div className="card panel">
        <h2 style={{ fontSize: '1.05rem' }}>{paused ? 'Store is paused' : 'Store is visible'}</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          Pausing hides the catalogue and WhatsApp button. Nothing is deleted. You can still edit listings.
        </p>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            setNotice('');
            try {
              await capi('/vendor/business/pause', { method: 'POST', body: JSON.stringify({ paused: !paused }) });
              setPaused(!paused);
              setNotice(paused ? 'Store is visible again.' : 'Store paused. Buyers will see a taking-a-break page.');
            } catch (err) {
              setError(extractError(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {paused ? 'Resume store' : 'Pause store'}
        </button>
      </div>

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

        <div className="card panel">
          <h2 style={{ fontSize: '1.05rem' }}>Storefront</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Choose what buyers see. WhatsApp stays on — that is how they reach you.</p>
          <div className="form-row">
            <label className="field">Style
              <select className="select" value={style} onChange={(e) => setStyle(e.target.value)}>
                {['classic', 'editorial', 'minimal', 'bold'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="field">Accent
              <input className="input" value={accent} onChange={(e) => setAccent(e.target.value)} placeholder="#1f8a5b" />
            </label>
            <label className="field">Hours
              <input className="input" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Mon–Sat, 9am–6pm" />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
            {Object.keys(sections).map((key) => (
              <label key={key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={sections[key] !== false} onChange={(e) => setSections((s) => ({ ...s, [key]: e.target.checked }))} />
                {key}
              </label>
            ))}
          </div>
          <label className="field">Questions, one per line as Question | Answer
            <textarea className="textarea" value={faq} onChange={(e) => setFaq(e.target.value)} placeholder="Do you deliver in Lagos? | Yes, we agree the fee on WhatsApp." />
          </label>
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
