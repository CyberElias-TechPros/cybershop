'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { BusinessOut, CategoryOut } from '@/lib/types';
import BusinessCard from './BusinessCard';

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * How far the pointer must travel before a press on the reel counts as a drag
 * rather than a tap. Below this the gesture is left entirely to the browser so
 * that tapping a card still opens it.
 */
const DRAG_THRESHOLD = 6;

/**
 * Drag-friendly horizontal reel of featured storefronts.
 *
 * Vertical wheel scrolling is deliberately *not* hijacked (it used to convert
 * the page's downward scroll into sideways reel movement and block the page
 * until the reel hit its end — the home page felt stuck). Trackpads scroll it
 * natively, touch drags it, and the arrows below make the axis discoverable.
 */
export function BusinessReel({ businesses }: { businesses: BusinessOut[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [scrollable, setScrollable] = useState(false);

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setScrollable(max > 8);
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft >= max - 4);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let down = false;
    let startX = 0;
    let startScroll = 0;
    let moved = false;
    let captured = false;

    const onDown = (e: PointerEvent) => {
      // only the primary button / a single finger, and never on a control
      if (e.button !== 0) return;
      down = true;
      moved = false;
      captured = false;
      startX = e.clientX;
      startScroll = el.scrollLeft;
      // Deliberately NOT capturing here. Capturing on pointerdown retargets
      // every later event for this gesture — including the click — to this
      // container, so a tap that began on a card's link would never reach
      // the link and the card would look broken. Wait until onMove is sure
      // this is a drag, then capture.
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (!captured) {
        // Below the threshold this is still a tap, so leave the browser to
        // it — no capture, no scroll, no interference.
        if (Math.abs(dx) <= DRAG_THRESHOLD) return;
        captured = true;
        moved = true;
        el.classList.add('is-drag');
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already gone */
        }
      }
      el.scrollLeft = startScroll - dx;
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      down = false;
      if (captured) {
        try {
          if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
        captured = false;
      }
      el.classList.remove('is-drag');
      sync();
    };
    const onClick = (e: MouseEvent) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('click', onClick, true);
    el.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('click', onClick, true);
      el.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [sync]);

  const step = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const card = el.querySelector('.cine-reel-item');
    const amount = (card?.getBoundingClientRect().width ?? el.clientWidth * 0.8) + 18;
    el.scrollBy({ left: dir * amount, behavior: prefersReduced() ? 'auto' : 'smooth' });
  };

  return (
    <>
      <div className="cine-reel" ref={ref} data-elastic="">
        {businesses.map((b) => (
          <div className="cine-reel-item" key={b.id}>
            <BusinessCard b={b} featured />
          </div>
        ))}
      </div>
      {scrollable && (
        <div className="cine-reel-bar">
          <span className="cine-reel-hint">Drag or scroll sideways</span>
          <button
            type="button"
            className="cine-reel-btn"
            aria-label="Previous businesses"
            onClick={() => step(-1)}
            disabled={atStart}
          >
            ←
          </button>
          <button
            type="button"
            className="cine-reel-btn"
            aria-label="More businesses"
            onClick={() => step(1)}
            disabled={atEnd}
          >
            →
          </button>
        </div>
      )}
    </>
  );
}

/** Editorial bento of categories — large type, not a generic icon grid. */
export function CategoryBento({ cats }: { cats: CategoryOut[] }) {
  if (cats.length === 0) return null;
  const [a, b, ...rest] = cats;
  return (
    <div className="cine-bento">
      {a && (
        <a className="cine-tile cine-tile-lg cine-magnet" href={`/categories/${a.slug}`}>
          <span className="cine-tile-idx">01</span>
          <span className="cine-tile-icon" aria-hidden>
            {a.icon || '✦'}
          </span>
          <span className="cine-tile-name">{a.name}</span>
          {a.description && <span className="cine-tile-desc">{a.description}</span>}
          <span className="cine-tile-go">Enter →</span>
        </a>
      )}
      {b && (
        <a className="cine-tile cine-tile-md cine-magnet" href={`/categories/${b.slug}`}>
          <span className="cine-tile-idx">02</span>
          <span className="cine-tile-icon" aria-hidden>
            {b.icon || '✦'}
          </span>
          <span className="cine-tile-name">{b.name}</span>
          {b.description && <span className="cine-tile-desc">{b.description}</span>}
        </a>
      )}
      <div className="cine-bento-stack">
        {rest.map((c, i) => (
          <a className="cine-tile cine-tile-sm cine-magnet" href={`/categories/${c.slug}`} key={c.slug}>
            <span className="cine-tile-idx">{String(i + 3).padStart(2, '0')}</span>
            <span className="cine-tile-icon" aria-hidden>
              {c.icon || '✦'}
            </span>
            <span className="cine-tile-name">{c.name}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

const BUBBLES = [
  { who: 'you', text: 'Hi — I found Cyber Elias Academy on CyberShop.' },
  { who: 'them', text: 'Welcome. From zero to expert, together. Which skill?' },
  { who: 'you', text: 'Web Development — the 6-week class. Still open?' },
  { who: 'them', text: 'Yes. Certificate on completion. I’ll send enrolment now. ✨' },
];

/** Cinematic WhatsApp stage — a conversation, not a screenshot. */
export function ChatStage({ categories }: { categories: CategoryOut[] }) {
  const orbit = categories.slice(0, 5);
  return (
    <div className="phone-stage" aria-hidden="true">
      <div className="phone-orbit">
        {orbit.map((c, i) => (
          <span key={c.slug} className="orbit-chip" style={{ ['--o' as string]: i }}>
            {c.icon ? `${c.icon} ` : ''}
            {c.name}
          </span>
        ))}
      </div>
      <div className="phone">
        <div className="phone-notch" />
        <div className="phone-bar">
          <span className="phone-ava">CS</span>
          <div>
            <strong>Cyber Elias Academy</strong>
            <em>online · WhatsApp</em>
          </div>
        </div>
        <div className="phone-chat">
          {BUBBLES.map((b, i) => (
            <p key={i} className={`bubble ${b.who}`} style={{ ['--i' as string]: i }}>
              {b.text}
            </p>
          ))}
        </div>
        <div className="phone-compose">
          <span>Message…</span>
          <i>➤</i>
        </div>
      </div>
      <div className="phone-glow" />
    </div>
  );
}

export function Act({ n, title, body, i }: { n: string; title: string; body: string; i: number }) {
  return (
    <article className="cine-act" style={{ ['--i' as string]: i }}>
      <span className="cine-act-n">{n}</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

export function Manifesto({ children }: { children: ReactNode }) {
  return <div className="cine-manifesto">{children}</div>;
}
