'use client';

import { useCallback, useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface BankAccount {
  bank: string;
  account_name: string;
  account_number: string;
  reference?: string;
}

export default function AdminSettingsPage() {
  const [platform, setPlatform] = useState({ name: 'CyberShop', tagline: 'Find a business. Talk to it on WhatsApp.', currency: 'NGN', support_email: 'support@cybershop.ng', announcement: '' });
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await capi<{ settings: { platform?: typeof platform; bank_accounts?: BankAccount[] } }>('/admin/settings');
      if (d.settings.platform) setPlatform({ ...platform, ...d.settings.platform });
      if (Array.isArray(d.settings.bank_accounts)) setBankAccounts(d.settings.bank_accounts);
      setLoaded(true);
    } catch (e) {
      setError(extractError(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await capi('/admin/settings', { method: 'PUT', body: JSON.stringify({ platform, bank_accounts: bankAccounts }) });
      setNotice('Settings saved.');
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="dash-head">
        <h1>Platform settings</h1>
      </div>
      {error && <div className="form-msg error">{error}</div>}
      {notice && <div className="form-msg success">{notice}</div>}
      {!loaded && <p style={{ color: 'var(--muted)' }}>Loading…</p>}

      <div className="card panel">
        <h2 style={{ fontSize: '1.05rem' }}>Platform</h2>
        <div className="form-row">
          <div className="field">
            <label>Platform name</label>
            <input className="input" value={platform.name} onChange={(e) => setPlatform({ ...platform, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Currency</label>
            <input className="input" value={platform.currency} onChange={(e) => setPlatform({ ...platform, currency: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>Tagline (home page hero)</label>
          <input className="input" value={platform.tagline} onChange={(e) => setPlatform({ ...platform, tagline: e.target.value })} />
        </div>
        <div className="field">
          <label>Support email</label>
          <input className="input" type="email" value={platform.support_email} onChange={(e) => setPlatform({ ...platform, support_email: e.target.value })} />
        </div>
        <div className="field">
          <label>Homepage notice (optional)</label>
          <input className="input" maxLength={180} value={platform.announcement || ''} onChange={(e) => setPlatform({ ...platform, announcement: e.target.value })} placeholder="Shown above the market. Leave blank to hide." />
        </div>
      </div>

      <div className="card panel">
        <h2 style={{ fontSize: '1.05rem' }}>Bank accounts (shown to vendors on bank transfer)</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: -4 }}>
          Where vendors send their plan payments. Vendors must upload the transfer proof afterwards.
        </p>
        {bankAccounts.map((ba, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input className="input" placeholder="Bank (Zenith Bank)" value={ba.bank} onChange={(e) => setBankAccounts(bankAccounts.map((x, j) => (j === i ? { ...x, bank: e.target.value } : x)))} />
            <input className="input" placeholder="Account name" value={ba.account_name} onChange={(e) => setBankAccounts(bankAccounts.map((x, j) => (j === i ? { ...x, account_name: e.target.value } : x)))} />
            <input className="input" placeholder="Account number" value={ba.account_number} onChange={(e) => setBankAccounts(bankAccounts.map((x, j) => (j === i ? { ...x, account_number: e.target.value } : x)))} />
            <input className="input" placeholder="Reference (optional)" value={ba.reference ?? ''} onChange={(e) => setBankAccounts(bankAccounts.map((x, j) => (j === i ? { ...x, reference: e.target.value } : x)))} />
            <button className="mini-btn danger" onClick={() => setBankAccounts(bankAccounts.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        <button className="mini-btn" onClick={() => setBankAccounts([...bankAccounts, { bank: '', account_name: '', account_number: '' }])}>
          + Add bank account
        </button>
      </div>

      <div className="form-actions">
        <button className="btn btn-primary" onClick={save} disabled={busy || !loaded}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </div>
  );
}
