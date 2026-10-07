'use client';

import { useState } from 'react';

/**
 * Footer (client) — brand, nav, legal links, live support email.
 * The email button copies the address (mobile-friendly: no app-switch surprise).
 */
export default function FooterClient({ supportEmail, safety }: { supportEmail: string; safety: string }) {
  const [copied, setCopied] = useState(false);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(supportEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.location.href = `mailto:${supportEmail}`;
    }
  }

  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <span className="wordmark">
            Cyber<span>Shop</span>
          </span>
          <p>
            The night market that never closes. Find a business. Talk to it on
            WhatsApp — no checkout, no middlemen.
          </p>
        </div>
        <nav aria-label="Explore">
          <strong>Explore</strong>
          <a href="/listings">Listings</a>
          <a href="/jobs">Jobs</a>
          <a href="/businesses">Businesses</a>
          <a href="/search">Search</a>
          <a href="/saved">Saved ads</a>
          <a href="/account">Your account</a>
          <a href="/cart">WhatsApp cart</a>
          <a href="/safety">Safety</a>
        </nav>
        <nav aria-label="Vendors">
          <strong>Vendors</strong>
          <a href="/register">Open a storefront</a>
          <a href="/login">Sign in</a>
          <a href="/onboarding">Choose a plan</a>
          <a href="/contact">Contact us</a>
        </nav>
        <nav aria-label="House">
          <strong>House</strong>
          <button type="button" className="footer-mail" onClick={copyEmail} title="Copy our support email">
            {copied ? 'Copied ✓' : supportEmail}
          </button>
          <a href="/contact">Support</a>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
          <a href="/content-policy">Content policy</a>
          <span className="footer-hours">Always open · GMT+1</span>
        </nav>
      </div>
      <p className="footer-trust">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 3l7 3v5.5c0 4.3-2.9 7.9-7 9.5-4.1-1.6-7-5.2-7-9.5V6l7-3z" strokeLinejoin="round" />
          <path d="M9.3 12.2l1.9 1.9 3.6-3.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{safety} <a href="/safety">Read the safety guide →</a></span>
      </p>
      <div className="footer-bar">
        <span>© {new Date().getFullYear()} CyberShop. Made for conversations.</span>
        <span className="footer-sig">Lagos · the continent · the chat</span>
      </div>
    </footer>
  );
}
