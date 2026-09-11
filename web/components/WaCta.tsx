'use client';

import { useState } from 'react';
import SwipeWa from '@/components/SwipeWa';

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The "Enquire on WhatsApp" call-to-action.
 *
 * On activation it first POSTs /api/public/inquiries (the Worker records the
 * lead and returns the exact wa.me URL + pre-filled message), then opens
 * WhatsApp. If the POST fails it falls back to the pre-computed waUrl so the
 * buyer can still reach the business; with JS disabled the plain <a> does the
 * same.
 *
 * Item pages also get the "Slide to open WhatsApp" liquid slider as the
 * primary gesture — a fallback tap button stays below it (accessibility +
 * vendors' low-tech-confidence audience).
 */
export default function WaCta(props: Props) {
  const { businessId, listingId, waUrl, ctaLabel = 'Enquire on WhatsApp', priceDisplay, withDetails = false, messagePreview } = props;
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fade, setFade] = useState(false);

  const open = (url: string) => {
    const w = window.open(url, '_blank', 'noopener');
    if (!w) window.location.href = url; // popup blocked → go in-tab
  };

  /** Record the lead and hand the buyer to WhatsApp. */
  async function doOpen() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch('/api/public/inquiries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, listing_id: listingId ?? null, quantity, name: name.trim() || null }),
      });
      const j = await res.json();
      if (res.ok && j?.wa_url) open(j.wa_url);
      else if (waUrl) open(waUrl);
      else setFailed(true);
    } catch {
      if (waUrl) open(waUrl);
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (busy) return;
    if (!waUrl) e.preventDefault(); // storefront CTA: must go through the inquiry POST
    await doOpen();
  }

  const onSlideLaunch = async () => {
    setFade(true);
    await sleep(480);
    await doOpen();
    setTimeout(() => setFade(false), 2600);
  };

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
      {withDetails && waUrl ? (
        <>
          <SwipeWa onLaunch={onSlideLaunch} label="Slide to open WhatsApp" />
          <a className="btn btn-wa btn-alt" href={waUrl} target="_blank" rel="noopener" onClick={handleClick} aria-disabled={disabled}>
            {busy ? 'Opening WhatsApp…' : `💬 ${ctaLabel || 'Enquire on WhatsApp'}`}
          </a>
        </>
      ) : (
        <a className="btn btn-wa" href={waUrl || '#'} target="_blank" rel="noopener" onClick={handleClick} aria-disabled={disabled}>
          {busy ? 'Opening WhatsApp…' : `💬 ${ctaLabel || 'Enquire on WhatsApp'}`}
        </a>
      )}
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
      {fade && (
        <div className="wa-fade" aria-hidden="true">
          <span>Opening WhatsApp…</span>
        </div>
      )}
    </div>
  );
}
