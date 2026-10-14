'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

export interface CatLink {
  href: string;
  label: string;
  icon: string | null;
}

/**
 * Categories, grouped. Categories are children of the Shop — listing them
 * as flat siblings of Shop/Businesses/Sell in the navbar mixed two levels
 * of navigation and ate the header. Desktop gets one "Categories" button
 * with a panel (every category, with icons); the panel closes on Escape,
 * outside click and navigation, and is fully keyboard-operable.
 */
export default function CategoriesMenu({ cats }: { cats: CatLink[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const box = useRef<HTMLDivElement>(null);
  const current = pathname.startsWith('/categories/');

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  if (cats.length === 0) return null;

  return (
    <div className="nav-cats" ref={box}>
      <button
        type="button"
        className={`nav-cats-btn${current ? ' is-current' : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        Categories
        <span aria-hidden="true" className={`nav-cats-caret${open ? ' is-open' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="nav-cats-panel" role="menu" aria-label="Categories">
          <a className="nav-cats-all" href="/listings" role="menuitem">
            🛍️ Shop all listings
          </a>
          {cats.map((c) => (
            <a key={c.href} href={c.href} role="menuitem" aria-current={pathname === c.href ? 'page' : undefined}>
              <span aria-hidden="true">{c.icon || '✦'}</span> {c.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
