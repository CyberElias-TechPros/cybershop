'use client';

import { useState } from 'react';
import { capi, extractError, fmtNaira } from '@/lib/client-api';

interface Props {
  businessId: number;
  listingId: number;
  askingKobo: number | null;
  chat: boolean;
  escrow: boolean;
}

export default function PremiumBuyer({ businessId, listingId, askingKobo, chat, escrow }: Props) {
  const [tab, setTab] = useState<'chat' | 'deposit' | null>(chat ? 'chat' : escrow ? 'deposit' : null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [body, setBody] = useState('');
  const [amount, setAmount] = useState(askingKobo ? String(Math.round(askingKobo / 100)) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (!chat && !escrow) return null;

  async function sendChat() {
    setBusy(true);
    setError('');
    try {
      const r = await capi<{ token: string }>('/public/threads', {
        method: 'POST',
        body: JSON.stringify({ business_id: businessId, listing_id: listingId, name, phone, body }),
      });
      window.location.href = `/inbox/${r.token}`;
    } catch (e) {
      setError(extractError(e));
      setBusy(false);
    }
  }

  async function startDeposit() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const naira = Number(amount);
      if (!Number.isFinite(naira) || naira < 100) {
        setError('Enter at least ₦100.');
        setBusy(false);
        return;
      }
      const r = await capi<{ paystack?: { url?: string }; disclaimer?: string }>('/public/deposits', {
        method: 'POST',
        body: JSON.stringify({
          listing_id: listingId,
          name,
          phone,
          email: email || 'buyer@cybershop.ng',
          amount_kobo: Math.round(naira * 100),
        }),
      });
      if (r.paystack?.url) {
        window.location.href = r.paystack.url;
        return;
      }
      setNotice(r.disclaimer || 'Deposit started.');
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card panel" style={{ marginTop: 16 }}>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 0 }}>
        WhatsApp is always free. These extras exist because this seller paid for them.
      </p>
      <div className="row-actions" style={{ marginBottom: 12 }}>
        {chat && (
          <button type="button" className={`mini-btn${tab === 'chat' ? '' : ''}`} onClick={() => setTab('chat')}>
            Message in-app
          </button>
        )}
        {escrow && (
          <button type="button" className="mini-btn" onClick={() => setTab('deposit')}>
            Record a deposit
          </button>
        )}
      </div>
      {error && <div className="form-msg error">{error}</div>}
      {notice && <div className="form-msg success">{notice}</div>}
      {tab === 'chat' && chat && (
        <>
          <div className="field">
            <label htmlFor="pm-name">Your name</label>
            <input id="pm-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pm-phone">Phone (optional)</label>
            <input id="pm-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pm-body">Message</label>
            <textarea id="pm-body" className="textarea" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Is this still available?" />
          </div>
          <button className="btn btn-primary" type="button" onClick={sendChat} disabled={busy || body.trim().length < 2}>
            {busy ? 'Sending…' : 'Send message'}
          </button>
        </>
      )}
      {tab === 'deposit' && escrow && (
        <>
          <p style={{ fontSize: '0.88rem', color: 'var(--ink-dim)' }}>
            CyberShop records the Paystack payment. We are not a bank and do not hold the cash. Meet in
            public, inspect, then the seller marks it released.
          </p>
          <div className="field">
            <label htmlFor="dep-name">Your name</label>
            <input id="dep-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="dep-email">Email for Paystack</label>
            <input id="dep-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="dep-amt">Amount (₦)</label>
            <input id="dep-amt" className="input" type="number" min={100} value={amount} onChange={(e) => setAmount(e.target.value)} />
            {askingKobo ? <div className="hint">Asking price {fmtNaira(askingKobo)}</div> : null}
          </div>
          <button className="btn btn-gold" type="button" onClick={startDeposit} disabled={busy}>
            {busy ? 'Starting…' : 'Pay with Paystack'}
          </button>
        </>
      )}
    </div>
  );
}
