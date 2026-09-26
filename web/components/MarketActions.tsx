'use client';

import { useEffect, useState } from 'react';
import { haptic } from '@/lib/haptics';
import { isSaved, pushRecent, toggleSaved, type SavedAd } from '@/lib/saved';

const REASONS = [
  { id: 'spam', label: 'Spam or fake listing' },
  { id: 'fraud', label: 'Scam / fraud' },
  { id: 'misleading', label: 'Misleading photos or price' },
  { id: 'abusive', label: 'Abusive or illegal' },
  { id: 'other', label: 'Something else' },
];

export default function MarketActions({
  ad,
  entityType,
  entityId,
  businessId,
}: {
  ad: Omit<SavedAd, 'saved_at'>;
  entityType: 'listing' | 'business';
  entityId: number;
  businessId?: number;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    setSaved(isSaved(ad.listing_id));
    pushRecent(ad);
    const sync = () => setSaved(isSaved(ad.listing_id));
    window.addEventListener('cs-saved', sync);
    return () => window.removeEventListener('cs-saved', sync);
  }, [ad]);

  async function share() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const title = `${ad.name} · ${ad.price_display}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url, text: `${title} on CyberShop` });
        return;
      }
    } catch {
      /* user cancelled */
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      haptic('pop');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  async function report() {
    if (busy) return;
    setBusy(true);
    setDone('');
    try {
      const res = await fetch('/api/public/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entity_type: entityType, entity_id: entityId, reason, details: details.trim() || null }),
      });
      const j = await res.json();
      if (res.ok) {
        setDone(j.message || 'Thanks. Our team will review this.');
        haptic('long');
        setTimeout(() => setReportOpen(false), 1400);
      } else {
        setDone(j?.error?.message || 'Could not send. Try again.');
      }
    } catch {
      setDone('Network error — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="market-actions">
      <button
        type="button"
        className={`mact${saved ? ' on' : ''}`}
        onClick={() => {
          const now = toggleSaved(ad);
          setSaved(now);
          haptic('pop');
          if (ad.listing_id) {
            fetch('/api/account/favorites', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ listing_id: ad.listing_id }),
            }).catch(() => undefined);
          }
        }}
        aria-pressed={saved}
      >
        {saved ? '♥ Saved' : '♡ Save'}
      </button>
      <button type="button" className="mact" onClick={share}>
        {copied ? 'Copied' : '↗ Share'}
      </button>
      <button type="button" className="mact" onClick={() => setReportOpen(true)}>
        ⚑ Report
      </button>
      {businessId ? (
        <button
          type="button"
          className="mact"
          onClick={async () => {
            const res = await fetch('/api/account/blocks', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ business_id: businessId }),
            });
            if (res.status === 401) {
              window.location.href = '/login';
              return;
            }
            if (res.ok) {
              setBlocked(true);
              haptic('long');
            }
          }}
        >
          {blocked ? 'Blocked' : 'Block seller'}
        </button>
      ) : null}

      {reportOpen && (
        <div className="cart-drawer-backdrop" onClick={() => setReportOpen(false)}>
          <div
            className="cart-drawer report-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Report this listing"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cart-drawer-head">
              <h2>Report abuse</h2>
              <button type="button" className="cart-x" aria-label="Close" onClick={() => setReportOpen(false)}>
                ✕
              </button>
            </div>
            <p className="cart-drawer-biz">We’ll review it. This never messages the vendor.</p>
            <fieldset className="report-reasons">
              <legend className="sr-only">Reason</legend>
              {REASONS.map((r) => (
                <label key={r.id}>
                  <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} />
                  {r.label}
                </label>
              ))}
            </fieldset>
            <label className="cart-note-field">
              Details (optional)
              <textarea className="textarea" rows={3} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} />
            </label>
            {done && <p role="status">{done}</p>}
            <button type="button" className="btn btn-gold cart-cta" onClick={report} disabled={busy}>
              {busy ? 'Sending…' : 'Send report'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
