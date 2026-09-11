'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Fx — the "fluid material" layer.
 *
 * One layout-level bridge (mounted in the root layout) owns all imperative
 * effects so they survive Next.js client-side navigation (the layout never
 * unmounts):
 *
 *  1. FlipBridge  — shared-element transitions: a catalog card expands and
 *                   morphs into the detail header (FLIP technique, transform
 *                   only). Reverse: swipe the detail image down (touch) or
 *                   press the back chip — it shrinks back into its grid slot.
 *  2. Tilt        — pointer/gyroscope parallax on [data-tilt] cards with a
 *                   specular highlight that follows the finger.
 *  3. Elastic     — rubber-band end-of-list stretch on touch devices.
 *
 * Everything is skipped for prefers-reduced-motion users, who get plain
 * navigation. No third-party animation code.
 */

/* ------------------------------------------------------------------ */
/* flip state (module scope: persists across client-side navigations)  */
/* ------------------------------------------------------------------ */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface FlipState {
  dir: 'open' | 'close';
  id: string;
  img: string;
  radius: number;
  from: string;
  ts: number;
}

let pending: FlipState | null = null;
let overlay: HTMLImageElement | null = null;
let scrim: HTMLDivElement | null = null;
let suppressVeil = false;
/** Last catalog path we opened a detail from (fallback for back). */
let lastFrom = '';

const reduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** True while a flip is in flight (lets TransitionFx skip the veil). */
export function flipSuppressing() {
  return suppressVeil;
}

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function showOverlay(img: string, r: Rect, radius: number) {
  removeOverlay();
  scrim = document.createElement('div');
  scrim.className = 'flip-scrim';
  overlay = document.createElement('img');
  overlay.className = 'flip-overlay';
  overlay.src = img;
  overlay.alt = '';
  Object.assign(overlay.style, {
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${r.w}px`,
    height: `${r.h}px`,
    borderRadius: `${radius}px`,
  });
  document.body.appendChild(scrim);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => scrim?.classList.add('in'));
}

function removeOverlay() {
  scrim?.remove();
  scrim = null;
  overlay?.remove();
  overlay = null;
}

function setScrimOpacity(v: number) {
  if (scrim) scrim.style.opacity = String(Math.max(0, Math.min(0.62, v)));
}

/** Animate the overlay (transform only) to `r`; resolves when settled. */
function flyTo(r: Rect, radius: number, ms = 480): Promise<void> {
  return new Promise((resolve) => {
    if (!overlay) return resolve();
    const o = overlay;
    const sx = parseFloat(o.style.left) || 0;
    const sy = parseFloat(o.style.top) || 0;
    const sw = parseFloat(o.style.width) || r.w;
    const sh = parseFloat(o.style.height) || r.h;

    o.style.transition = 'none';
    o.style.transformOrigin = 'top left';
    o.style.left = `${r.x}px`;
    o.style.top = `${r.y}px`;
    o.style.width = `${r.w}px`;
    o.style.height = `${r.h}px`;
    o.style.borderRadius = `${radius}px`;
    o.style.transform = `translate(${sx - r.x}px, ${sy - r.y}px) scale(${sw / r.w}, ${sh / r.h})`;
    void o.offsetWidth; // reflow so the start transform applies
    o.style.transition = `transform ${ms}ms cubic-bezier(0.32, 0.72, 0, 1)`;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      o.removeEventListener('transitionend', finish);
      resolve();
    };
    o.addEventListener('transitionend', finish);
    o.style.transform = 'none';
    setTimeout(finish, ms + 150); // safety
  });
}

function inViewport(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.top >= 0 && r.bottom <= window.innerHeight;
}

/* ------------------------------------------------------------------ */
/* bridge                                                              */
/* ------------------------------------------------------------------ */

export function FlipBridge() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);

  /* ---------- 1. flip: capture card tap, create the flying overlay ---- */
  useEffect(() => {
    const onClick = (e: Event) => {
      const target = e.target as Element | null;
      if (!target?.closest) return;
      const a = target.closest('a[data-flip]') as HTMLAnchorElement | null;
      if (!a || reduced()) return;
      const href = a.getAttribute('href') ?? '';
      if (a.target === '_blank' || (href.startsWith('http') && !href.startsWith(window.location.origin))) return;
      const id = a.dataset.flip;
      if (!id) return;
      const wrap = (a.querySelector('[data-flip-src]') ?? a.querySelector('.item-img, .biz-thumb') ?? a) as Element;
      const r = rectOf(wrap);
      if (r.w < 48 || r.h < 48) return; // skip tiny/off-screen cards
      const imgEl = wrap.querySelector('img') as HTMLImageElement | null;
      pending = {
        dir: 'open',
        id,
        img: imgEl ? imgEl.currentSrc || imgEl.src : '',
        radius: 16,
        from: pathRef.current,
        ts: Date.now(),
      };
      suppressVeil = true;
      showOverlay(pending.img, r, pending.radius);
      // do NOT preventDefault — let Next route; the new page lands the overlay
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, []);

  /* ---------- 2. flip: land the overlay on the destination page ------- */
  useEffect(() => {
    if (!pending) return;
    const st = pending;
    if (Date.now() - st.ts > 4000) {
      pending = null;
      removeOverlay();
      setTimeout(() => (suppressVeil = false), 300);
      return;
    }
    let tries = 0;
    let cancelled = false;

    const land = async () => {
      const sel = st.dir === 'open' ? `[data-flip-target="${CSS.escape(st.id)}"]` : `[data-flip="${CSS.escape(st.id)}"]`;
      const node = document.querySelector(sel) as HTMLElement | null;
      if (!node) {
        if (!cancelled && ++tries < 120) requestAnimationFrame(tick);
        else {
          cancelled = true;
          pending = null;
          removeOverlay();
          setTimeout(() => (suppressVeil = false), 300);
        }
        return;
      }
      pending = null;

      if (st.dir === 'open') {
        // destination: detail header (or storefront cover)
        if (st.from) lastFrom = st.from;
        node.classList.add('flip-hidden');
        const r = rectOf(node);
        await flyTo(r, st.radius + 2);
        setScrimOpacity(0.3);
        node.classList.remove('flip-hidden');
        document.body.classList.add('flip-landed');
        // let the cascade breathe, then clean up
        setTimeout(() => {
          removeOverlay();
          document.body.classList.remove('flip-landed');
          setTimeout(() => (suppressVeil = false), 800);
        }, 550);
      } else {
        // destination: the original card in the grid
        const card = node;
        const wrap = (card.querySelector('.item-img, .biz-thumb') ?? card) as Element;
        if (!inViewport(wrap)) {
          card.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
          await new Promise((res) => setTimeout(res, 80));
        }
        const r = rectOf(wrap);
        card.classList.add('flip-hidden');
        await flyTo(r, 16);
        setScrimOpacity(0);
        card.classList.remove('flip-hidden');
        removeOverlay();
        setTimeout(() => (suppressVeil = false), 300);
      }
    };

    const tick = () => {
      land();
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  /* ---------- 3. tilt: pointer parallax + specular highlight ---------- */
  useEffect(() => {
    if (reduced()) return;
    let cur: HTMLElement | null = null;

    const clear = (el: HTMLElement) => {
      el.classList.remove('tilt-on');
      el.style.removeProperty('--tx');
      el.style.removeProperty('--ty');
    };

    const apply = (el: HTMLElement, px: number, py: number) => {
      if (cur && cur !== el) clear(cur);
      cur = el;
      el.classList.add('tilt-on');
      el.style.setProperty('--ty', `${(px * 4.5).toFixed(2)}deg`);
      el.style.setProperty('--tx', `${(-py * 4.5).toFixed(2)}deg`);
      el.style.setProperty('--mx', `${((px + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${((py + 0.5) * 100).toFixed(1)}%`);
    };

    const fromPoint = (e: { clientX: number; clientY: number; target: EventTarget | null }) => {
      const target = e.target as Element | null;
      const el = (target?.closest?.('.tilt') as HTMLElement | null) ?? null;
      if (!el) {
        if (cur) {
          clear(cur);
          cur = null;
        }
        return;
      }
      const r = el.getBoundingClientRect();
      apply(el, (e.clientX - r.left) / r.width - 0.5, (e.clientY - r.top) / r.height - 0.5);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return; // touch handled by touchmove
      fromPoint(e);
    };
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      fromPoint(e.touches[0]);
    };
    const onTouchEnd = () => {
      if (cur) {
        clear(cur);
        cur = null;
      }
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('touchmove', onTouch, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  /* ---------- 4. gyro: subtle device-tilt parallax on the aurora ------ */
  useEffect(() => {
    if (reduced()) return;
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof DOE === 'undefined') return;
    // iOS requires an explicit permission prompt on a user gesture — we don't
    // prompt; Android fires events without one.
    if (typeof DOE.requestPermission === 'function') return;
    let raf = 0;
    const onOrient = (e: DeviceOrientationEvent) => {
      const b = e.beta ?? 0;
      const g = e.gamma ?? 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        document.body.style.setProperty('--gy', (Math.max(-30, Math.min(30, b)) / 30).toFixed(3));
        document.body.style.setProperty('--gx', (Math.max(-30, Math.min(30, g)) / 30).toFixed(3));
      });
    };
    window.addEventListener('deviceorientation', onOrient, { passive: true });
    return () => {
      window.removeEventListener('deviceorientation', onOrient);
      cancelAnimationFrame(raf);
    };
  }, []);

  /* ---------- 5. close gesture: swipe the detail image down ----------- */
  useEffect(() => {
    if (reduced()) return;
    let el: HTMLElement | null = null;
    let startY = 0;
    let active = false;

    const onDown = (e: TouchEvent) => {
      const target = e.target as Element | null;
      const node = target?.closest?.('[data-flip-close]') as HTMLElement | null;
      if (!node || window.scrollY > 8) return; // only from the top of the page
      el = node;
      startY = e.touches[0].clientY;
      active = false;
    };
    const onMove = (e: TouchEvent) => {
      if (!el) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) return;
      if (!active) {
        active = true;
        el.style.transition = 'none';
        el.style.willChange = 'transform';
      }
      const d = Math.min(260, dy * 0.75);
      el.style.transform = `translateY(${d}px) scale(${(1 - d / 1400).toFixed(4)})`;
      setScrimOpacity(d / 320);
      if (e.cancelable && d > 12) e.preventDefault();
    };
    const onUp = () => {
      if (!el) return;
      const node = el;
      const dy = parseFloat((node.style.transform.match(/translateY\(([\d.]+)px\)/) ?? [])[1] ?? '0');
      el = null;
      if (dy > 90) {
        // commit: flipBack() reads the (transformed) rect for the overlay
        const id = node.dataset.flipClose;
        if (id) flipBack(id);
        return;
      }
      // spring back
      node.style.transition = 'transform 0.5s cubic-bezier(0.22, 1.2, 0.36, 1)';
      node.style.transform = '';
      setScrimOpacity(0);
      setTimeout(() => {
        node.style.transition = '';
        node.style.willChange = '';
      }, 520);
    };

    window.addEventListener('touchstart', onDown, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp, { passive: true });
    window.addEventListener('touchcancel', onUp, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onDown);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('touchcancel', onUp);
    };
  }, []);

  /* ---------- 6. elastic: rubber-band end of list (touch only) -------- */
  useEffect(() => {
    if (reduced()) return;
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    let el: HTMLElement | null = null;
    let startY = 0;

    const atBottom = () =>
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

    const onDown = (e: TouchEvent) => {
      const target = e.target as Element | null;
      el = (target?.closest?.('[data-elastic]') as HTMLElement | null) ?? null;
      startY = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (!el) return;
      const dy = e.touches[0].clientY - startY;
      if (atBottom() && dy > 0) {
        el.style.transition = 'none';
        el.style.transform = `translateY(${Math.min(84, dy * 0.4).toFixed(1)}px)`;
      } else if (el.style.transform) {
        el.style.transition = 'transform 0.55s cubic-bezier(0.22, 1.25, 0.36, 1)';
        el.style.transform = '';
        setTimeout(() => (el = null), 560);
      }
    };
    const onUp = () => {
      if (el?.style.transform) {
        const node = el;
        el = null;
        node.style.transition = 'transform 0.55s cubic-bezier(0.22, 1.25, 0.36, 1)';
        node.style.transform = '';
      } else {
        el = null;
      }
    };

    window.addEventListener('touchstart', onDown, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp, { passive: true });
    window.addEventListener('touchcancel', onUp, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onDown);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('touchcancel', onUp);
    };
  }, []);

  return null;
}

/* ------------------------------------------------------------------ */
/* reverse trigger: shrink the detail header back into the grid        */
/* ------------------------------------------------------------------ */

export function flipBack(id: string) {
  if (typeof window === 'undefined') return;
  if (reduced()) {
    history.back();
    return;
  }
  const target = document.querySelector(`[data-flip-target="${CSS.escape(id)}"]`) as HTMLElement | null;
  if (!target) {
    history.back();
    return;
  }
  const r = rectOf(target);
  const imgEl = target.querySelector('img') as HTMLImageElement | null;
  pending = {
    dir: 'close',
    id,
    img: imgEl ? imgEl.currentSrc || imgEl.src : '',
    radius: 18,
    from: lastFrom,
    ts: Date.now(),
  };
  suppressVeil = true;
  showOverlay(pending.img, r, pending.radius);
  const before = window.location.pathname;
  history.back();
  // Safety: if history had no entry to go back to (direct deep-link), the
  // pathname never changes and the overlay would stick — recover.
  setTimeout(() => {
    if (pending && window.location.pathname === before) {
      pending = null;
      removeOverlay();
      suppressVeil = false;
      if (lastFrom) window.location.assign(lastFrom);
    }
  }, 900);
}

/** Small floating "back" chip on detail pages (desktop-first affordance). */
export function FlipBack({ id, children = '←' }: { id: string; children?: ReactNode }) {
  return (
    <button type="button" className="flip-back" aria-label="Back to previous page" onClick={() => flipBack(id)}>
      {children}
    </button>
  );
}
