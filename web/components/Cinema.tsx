'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { BusinessOut, CategoryOut } from '@/lib/types';
import BusinessCard from './BusinessCard';

/** Drag / wheel-friendly horizontal reel of featured storefronts. */
export function BusinessReel({ businesses }: { businesses: BusinessOut[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let down = false;
    let startX = 0;
    let startScroll = 0;
    let moved = false;

    const onDown = (e: PointerEvent) => {
      down = true;
      moved = false;
      startX = e.clientX;
      startScroll = el.scrollLeft;
      el.classList.add('is-drag');
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 6) moved = true;
      el.scrollLeft = startScroll - dx;
    };
    const onUp = () => {
      down = false;
      el.classList.remove('is-drag');
    };
    const onClick = (e: MouseEvent) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
        el.scrollLeft += e.deltaY;
        if (el.scrollLeft > 0 && el.scrollLeft < el.scrollWidth - el.clientWidth) e.preventDefault();
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('click', onClick, true);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('click', onClick, true);
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  return (
    <div className="cine-reel" ref={ref} data-elastic="">
      {businesses.map((b) => (
        <div className="cine-reel-item" key={b.id}>
          <BusinessCard b={b} featured />
        </div>
      ))}
    </div>
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
