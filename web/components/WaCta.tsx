'use client';

import { useState } from 'react';

interface Props {
  businessId: number;
  /** Item this CTA refers to (omitted for storefront-level CTA). */
  listingId?: number;
  /**
   * Pre-computed wa.me URL from the Worker (item pages only).
   * Used as the no-JavaScript fallback anchor target.
   */
  waUrl?: string | null;
  ctaLabel?: string;
  priceDisplay?: string;
  /** Show the quantity + name inputs (item pages). */
  withDetails?: boolean;
  messagePreview?: string;
}

/**
 * The "Enquire on WhatsApp" call-to-action.
 *
 * On click it first POSTs /api/public/inquiries (the Worker records the lead
 * and returns the exact wa.me URL + pre-filled message), then opens WhatsApp.
 * If the POST fails it falls back to the pre-computed waUrl so the buyer can
 * still reach the business; with JS disabled the plain <a> does the same.
 */
export default function WaCta(props: Props) {
  const { businessId, listingId, waUrl, ctaLabel = 'Enquire on WhatsApp', priceDisplay, withDetails = false, messagePreview } = props;
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const open = (url: string) => {
    window.open(url, '_blank', 'noopener');
  };

  async function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (busy) return;
    // No pre-computed URL (storefront CTA): must go through the inquiry POST.
    if (!waUrl) e.preventDefault();
    if (!waUrl && !busy) {
      e.preventDefault();
      setBusy(true);
      try {
        const res = await fetch('/api/public/inquiries', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ business_id: businessId, quantity, name: name.trim() || null }),
        });
        const j = await res.json();
        if (res.ok && j?.wa_url) open(j.wa_url);
        else setFailed(true);
      } catch {
        setFailed(true);
      } finally {
        setBusy(false);
      }
      return;
    }
    // Item CTA: record the lead (fire-and-forget style) then open WhatsApp.
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/public/inquiries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, listing_id: listingId ?? null, quantity, name: name.trim() || null }),
      });
      const j = await res.json();
      if (res.ok && j?.wa_url) open(j.wa_url);
      else open(waUrl!);
    } catch {
      open(waUrl!);
    } finally {
      setBusy(false);
    }
  }

  const disabled = !waUrl && busy;

  return (
    <div className="card wa-card">
      {priceDisplay && <div className="price-big">{priceDisplay}</div>}
      {withDetails && (
        <>
          <div className="qty-row">
            <label htmlFor="qty">Quantity</label>
            <div className="qty">
              <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                −
              </button>
              <input
                id="qty"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setQuantity(Number.isFinite(n) ? Math.min(999, Math.max(1, n)) : 1);
                }}
              />
              <button type="button" aria-label="Increase quantity" onClick={() => setQuantity((q) => Math.min(999, q + 1))}>
                +
              </button>
            </div>
          </div>
          <div className="name-row">
            <input
              type="text"
              placeholder="Your name (optional)"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              aria-label="Your name (optional)"
            />
          </div>
        </>
      )}
      <a className="btn btn-wa" href={waUrl || '#'} target="_blank" rel="noopener" onClick={handleClick} aria-disabled={disabled}>
        {busy ? 'Opening WhatsApp…' : `💬 ${ctaLabel || 'Enquire on WhatsApp'}`}
      </a>
      {failed && (
        <p className="wa-note" style={{ color: 'var(--danger)' }}>
          We couldn’t record your enquiry — please try again or contact the business directly.
        </p>
      )}
      {!failed && (
        <p className="wa-note">Opens WhatsApp with a pre-filled message. No account needed.</p>
      )}
      {messagePreview && (
        <div className="wa-msg-preview" aria-label="Preview of the WhatsApp message">
          <strong>Your message will start like this:</strong>
          {messagePreview}
        </div>
      )}
    </div>
  );
}
