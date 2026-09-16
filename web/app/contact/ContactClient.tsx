'use client';

import { useState } from 'react';

/** One-tap support email: copies the address, offers mailto. */
export default function ContactClient({ supportEmail }: { supportEmail: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(supportEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.location.href = `mailto:${supportEmail}`;
    }
  }

  return (
    <div className="contact-card card panel">
      <p className="contact-label">Email us</p>
      <div className="contact-row">
        <a className="contact-address" href={`mailto:${supportEmail}`}>
          {supportEmail}
        </a>
        <div className="contact-actions">
          <button type="button" className="btn btn-primary" onClick={copy}>
            {copied ? 'Copied ✓' : 'Copy address'}
          </button>
          <a className="btn btn-ghost" href={`mailto:${supportEmail}`}>
            Open mail app
          </a>
        </div>
      </div>
      <p className="contact-hint">Include your store name (if you have one) and what happened — screenshots help.</p>
    </div>
  );
}
