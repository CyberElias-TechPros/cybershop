'use client';

import { useEffect, useRef, useState } from 'react';
import { haptic } from '@/lib/haptics';

interface Props {
  /** Fired after the slide completes (parent records the inquiry + opens WhatsApp). */
  onLaunch: () => Promise<void> | void;
  label?: string;
}

/**
 * "Slide to open WhatsApp" — the purchase gesture.
 *
 * Drag the thumb across the shimmering track: a liquid gradient fills behind
 * it. On release (or velocity flick at the end) the thumb pops, a localized
 * confetti burst fires, a haptic double-tap confirms, and the app fades to
 * black while WhatsApp is pulled into view. Keyboard: focus the thumb and
 * press Enter. Reduced-motion users get the plain button instead (parent
 * decides; this component also degrades gracefully on its own).
 */
export default function SwipeWa({ onLaunch, label = 'Slide to open WhatsApp' }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const confRef = useRef<HTMLDivElement>(null);
  const [pState, setPState] = useState(0);
  const pRef = useRef(0);
  const dragging = useRef(false);
  const done = useRef(false);
  const last = useRef({ x: 0, t: 0, v: 0 });
  const p = pState;

  const PAD = 6;
  const THUMB = 52;

  useEffect(() => () => document.body.classList.remove('no-select'), []);

  const setP = (v: number) => {
    pRef.current = v;
    setPState(v);
    const track = trackRef.current;
    const fill = fillRef.current;
    const thumb = thumbRef.current;
    if (!track || !fill || !thumb) return;
    const usable = track.clientWidth - THUMB - PAD * 2;
    const x = v * usable;
    thumb.style.transform = `translateX(${x}px)${v >= 1 ? ' scale(1.04)' : ''}`;
    fill.style.width = `${x}px`;
  };

  const burst = () => {
    const host = confRef.current;
    if (!host || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#f2c879', '#2ce58e', '#ffffff', '#d4af37', '#7ee8b8', '#ffe9c2'];
    for (let i = 0; i < 30; i++) {
      const s = document.createElement('span');
      const a = Math.random() * Math.PI * 2;
      const d = 55 + Math.random() * 120;
      s.style.setProperty('--dx', `${(Math.cos(a) * d).toFixed(0)}px`);
      s.style.setProperty('--dy', `${(Math.sin(a) * d * 0.7 - 30).toFixed(0)}px`);
      s.style.setProperty('--rz', `${(Math.random() * 560 - 280).toFixed(0)}deg`);
      s.style.setProperty('--c', colors[i % colors.length] ?? '#f2c879');
      s.style.setProperty('--dl', `${(Math.random() * 90).toFixed(0)}ms`);
      host.appendChild(s);
    }
    setTimeout(() => {
      host.innerHTML = '';
    }, 1500);
  };

  const finish = async () => {
    if (done.current) return;
    done.current = true;
    dragging.current = false;
    trackRef.current?.classList.remove('drag');
    haptic('double');
    setP(1);
    trackRef.current?.classList.add('done');
    burst();
    await new Promise((r) => setTimeout(r, 950));
    try {
      await onLaunch();
      haptic('long');
    } catch {
      /* parent handles its own error state */
    }
  };

  const onDown = (e: React.PointerEvent) => {
    if (done.current) return;
    e.preventDefault();
    dragging.current = true;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    trackRef.current?.classList.add('drag');
    document.body.classList.add('no-select');
    last.current = { x: e.clientX, t: performance.now(), v: 0 };
    haptic('pop');
  };

  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current || done.current) return;
    const track = trackRef.current;
    if (!track) return;
    const r = track.getBoundingClientRect();
    const usable = r.width - THUMB - PAD * 2;
    const now = performance.now();
    const dt = now - last.current.t;
    if (dt > 0) last.current.v = (e.clientX - last.current.x) / dt;
    last.current = { x: e.clientX, t: now, v: last.current.v };
    let v = (e.clientX - r.left - PAD - THUMB / 2) / usable;
    v = Math.max(0, Math.min(1, v));
    setP(v);
    if (v >= 0.995 || (v > 0.82 && last.current.v > 0.4)) finish();
  };

  const onUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.classList.remove('no-select');
    if (done.current) return;
    const track = trackRef.current;
    track?.classList.remove('drag');
    track?.classList.add('snap');
    setP(0);
    setTimeout(() => track?.classList.remove('snap'), 480);
  };

  return (
    <div className="swipe-wrap">
      <div
        ref={trackRef}
        className="swipe-buy"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p * 100)}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            finish();
          }
        }}
      >
        <div ref={fillRef} className="swipe-fill" aria-hidden="true">
          <span className="swipe-fill-wave" aria-hidden="true" />
        </div>
        <div className="swipe-label" aria-hidden="true">
          {p >= 1 ? 'Opening WhatsApp…' : (
            <>
              {label} <span className="swipe-cue">»</span>
            </>
          )}
        </div>
        <div ref={thumbRef} className="swipe-thumb" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2.05 22l5.3-1.39a9.87 9.87 0 0 0 4.69 1.19h.01c5.46 0 9.9-4.44 9.9-9.9 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.26 8.26 0 0 1-1.26-4.39c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.23 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.29z" />
          </svg>
        </div>
        <div ref={confRef} className="confetti" aria-hidden="true" />
      </div>
    </div>
  );
}
