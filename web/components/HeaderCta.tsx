'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function HeaderCta({
  extra,
}: {
  extra: { href: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.documentElement.classList.toggle('menu-open', open);
    return () => document.documentElement.classList.remove('menu-open');
  }, [open]);

  return (
    <>
      <div className="header-cta">
        <a className="hdr-link" href="/saved">
          Saved
        </a>
        <a className="hdr-link" href="/login">
          Sign in
        </a>
        <a className="btn btn-gold sheen hdr-sell" href="/register">
          Sell on CyberShop
        </a>
        <button
          type="button"
          className={`hdr-burger${open ? ' is-open' : ''}`}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span />
          <span />
        </button>
      </div>
      <div className={`cine-menu${open ? ' is-open' : ''}`} hidden={!open}>
        <nav aria-label="Mobile">
          <a href="/listings" style={{ ['--i' as string]: 0 }}>
            <em>01</em> Listings
          </a>
          <a href="/businesses" style={{ ['--i' as string]: 1 }}>
            <em>02</em> Businesses
          </a>
          {extra.map((l, i) => (
            <a key={l.href} href={l.href} style={{ ['--i' as string]: i + 2 }}>
              <em>{String(i + 3).padStart(2, '0')}</em> {l.label}
            </a>
          ))}
          <a href="/saved" style={{ ['--i' as string]: extra.length + 2 }}>
            <em>{String(extra.length + 3).padStart(2, '0')}</em> Saved
          </a>
          <a href="/search" style={{ ['--i' as string]: extra.length + 3 }}>
            <em>{String(extra.length + 4).padStart(2, '0')}</em> Search
          </a>
          <a href="/register" style={{ ['--i' as string]: extra.length + 4 }}>
            <em>{String(extra.length + 5).padStart(2, '0')}</em> Sell on CyberShop
          </a>
          <a href="/login" style={{ ['--i' as string]: extra.length + 5 }}>
            <em>{String(extra.length + 6).padStart(2, '0')}</em> Sign in
          </a>
        </nav>
      </div>
    </>
  );
}
