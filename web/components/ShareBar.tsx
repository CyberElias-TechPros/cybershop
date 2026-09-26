'use client';

import { useState } from 'react';

/** Copy, chat apps, email, and a printable QR. The sale still happens on WhatsApp. */
export default function ShareBar({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const full = url.startsWith('http') ? url : typeof window !== 'undefined' ? `${window.location.origin}${url}` : url;
  const text = encodeURIComponent(title);
  const link = encodeURIComponent(full);
  const qr = `/api/qr.svg?d=${encodeURIComponent(full)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt('Copy this link', full);
    }
  }

  return (
    <div className="share-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
      <button type="button" className="mact" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
      <a className="mact" href={`https://wa.me/?text=${text}%20${link}`} target="_blank" rel="noopener">WhatsApp</a>
      <a className="mact" href={`https://t.me/share/url?url=${link}&text=${text}`} target="_blank" rel="noopener">Telegram</a>
      <a className="mact" href={`https://www.facebook.com/sharer/sharer.php?u=${link}`} target="_blank" rel="noopener">Facebook</a>
      <a className="mact" href={`https://twitter.com/intent/tweet?url=${link}&text=${text}`} target="_blank" rel="noopener">X</a>
      <a className="mact" href={`mailto:?subject=${text}&body=${link}`}>Email</a>
      <a className="mact" href={qr} download>QR</a>
    </div>
  );
}
