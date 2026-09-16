'use client';

import { useEffect, useState } from 'react';
import { extractError } from '@/lib/client-api';

/**
 * Storefront growth kit (vendor dashboard overview):
 *  - live QR code of the public storefront (print it, stick it in the shop)
 *  - copy store link
 *  - share to WhatsApp Status / anywhere (Web Share API with copy fallback)
 */
export default function StorefrontTools({ storeUrl, storeName }: { storeUrl: string; storeName: string }) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  const full = origin ? `${origin}${storeUrl}` : storeUrl;
  const qrSrc = `/api/qr.svg?d=${encodeURIComponent(full)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function share() {
    const text = `${storeName} on CyberShop — browse the full catalogue and message us directly:`;
    if (navigator.share) {
      try {
        await navigator.share({ title: storeName, text, url: full });
        return;
      } catch {
        /* user dismissed */
      }
    }
    // fallback: open WhatsApp Status composer (status = status broadcast) with the link
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${full}`)}`, '_blank', 'noopener');
  }

  return (
    <div className="card panel store-tools">
      <div className="store-tools-copy">
        <h2>Grow your store</h2>
        <p>
          Print the QR for your shop door, flyers or table tops — one scan opens your
          catalogue. Or drop your link on WhatsApp Status; that&apos;s where your customers already are.
        </p>
        <div className="store-tools-actions">
          <button type="button" className="btn btn-primary" onClick={share}>
            Share to WhatsApp Status
          </button>
          <button type="button" className="btn btn-ghost" onClick={copy}>
            {copied ? 'Link copied ✓' : 'Copy store link'}
          </button>
        </div>
      </div>
      <a className="store-tools-qr" href={qrSrc} download={`qr-${storeUrl.split('/').pop()}.svg`} title="Download QR (SVG — prints at any size)">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrSrc} alt={`QR code linking to ${storeName}`} width={148} height={148} loading="lazy" />
        <span>Download QR</span>
      </a>
    </div>
  );
}
