'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useDialogFocus } from '@/lib/useDialogFocus';

const MENU_ID = 'cine-menu';

export default function HeaderCta({
  extra,
  me,
}: {
  extra: { href: string; label: string }[];
  me: { role: string; name: string; unread: number } | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const burgerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // navigating away closes the menu
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // drives `html.menu-open` (scroll lock) in cine.css
  useEffect(() => {
    document.documentElement.classList.toggle('menu-open', open);
    return () => document.documentElement.classList.remove('menu-open');
  }, [open]);

  /* Escape closes, focus moves into the overlay and back to the burger, and
     Tab is kept inside it — the overlay used to trap the visitor with no way
     out but tapping a link. */
  useDialogFocus(open, menuRef, close);

  // a viewport that now shows the desktop nav must not stay locked
  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      if (window.matchMedia('(min-width: 981px)').matches) close();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, close]);

  /* Everything the desktop nav and the footer offer, in one place: the menu is
     the only navigation on a phone, so it cannot be a subset of it. */
  const links: { href: string; label: string }[] = [
    { href: '/listings', label: 'Listings' },
    { href: '/businesses', label: 'Businesses' },
    { href: '/jobs', label: 'Jobs' },
    ...extra,
    { href: '/search', label: 'Search' },
    { href: '/saved', label: 'Saved' },
    { href: '/cart', label: 'WhatsApp cart' },
    ...(me
      ? [
          me.role === 'admin'
            ? { href: '/admin', label: 'Admin' }
            : me.role === 'vendor'
              ? { href: '/dashboard', label: 'Dashboard' }
              : { href: '/account', label: 'Account' },
        ]
      : [
          { href: '/register', label: 'Sell on CyberShop' },
          { href: '/register/buyer', label: 'Create a buyer account' },
          { href: '/login', label: 'Sign in' },
        ]),
  ];

  return (
    <>
      <div className="header-cta">
        <a className="hdr-link" href="/saved">
          Saved
        </a>
        {me ? (
          <a className="btn btn-gold sheen hdr-sell" href={me.role === 'admin' ? '/admin' : me.role === 'vendor' ? '/dashboard' : '/account'}>
            {me.role === 'buyer' ? 'Account' : me.role === 'admin' ? 'Admin' : 'Dashboard'}
            {me.unread > 0 ? ` (${me.unread})` : ''}
          </a>
        ) : (
          <>
            <a className="hdr-link" href="/login">
              Sign in
            </a>
            <a className="btn btn-gold sheen hdr-sell" href="/register">
              Sell on CyberShop
            </a>
          </>
        )}
        <a className="hdr-search-btn" href="/search" aria-label="Search CyberShop">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.6-3.6" strokeLinecap="round" />
          </svg>
        </a>
        <button
          ref={burgerRef}
          type="button"
          className={`hdr-burger${open ? ' is-open' : ''}`}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls={MENU_ID}
          onClick={() => setOpen((v) => !v)}
        >
          <span />
          <span />
        </button>
      </div>
      <div
        id={MENU_ID}
        ref={menuRef}
        className={`cine-menu${open ? ' is-open' : ''}`}
        role="dialog"
        aria-modal={open}
        aria-label="Site menu"
        hidden={!open}
      >
        <button type="button" className="cine-menu-close" onClick={close}>
          Close ✕
        </button>
        <nav aria-label="Mobile">
          {links.map((l, i) => (
            <a key={l.href} href={l.href} style={{ ['--i' as string]: i }}>
              <em>{String(i + 1).padStart(2, '0')}</em> {l.label}
            </a>
          ))}
        </nav>
      </div>
    </>
  );
}
