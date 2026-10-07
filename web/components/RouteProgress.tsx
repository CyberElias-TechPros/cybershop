'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Navigation feedback.
 *
 * Every internal link in this app is a full server round-trip (catalogue pages,
 * the vendor workbench and the admin console are all `force-dynamic`). On a
 * phone that gap is long enough to read as a dead tap — the visitor taps
 * "Dashboard", nothing moves for a second or two, and they tap again or give
 * up. `usePathname()` cannot help here: it only changes once the new page has
 * already arrived.
 *
 * So we watch the click itself: an internal, same-tab, plain link starts a
 * determinate-feeling progress bar, and the pathname change (or a safety
 * timeout) finishes it. Cheap, no router internals, degrade-safe.
 */

const SAFETY_MS = 8000;

export default function RouteProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A new pathname means the page arrived → run the bar out.
  useEffect(() => {
    if (!active) return;
    setDone(true);
    const t = setTimeout(() => {
      setActive(false);
      setDone(false);
    }, 420);
    return () => clearTimeout(t);
  }, [pathname, active]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a');
      if (!(a instanceof HTMLAnchorElement)) return;
      if (a.target && a.target !== '_self') return;
      if (a.hasAttribute('download')) return;
      const href = a.getAttribute('href');
      if (!href || !href.startsWith('/') || href.startsWith('//')) return;
      const url = new URL(a.href, window.location.href);
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // hash / same page
      setDone(false);
      setActive(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setDone(true);
        setTimeout(() => {
          setActive(false);
          setDone(false);
        }, 420);
      }, SAFETY_MS);
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => {
      document.removeEventListener('click', onClick, { capture: true });
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!active) return null;
  return (
    <div className={`route-progress${done ? ' is-done' : ''}`} role="progressbar" aria-label="Loading page">
      <span />
    </div>
  );
}
