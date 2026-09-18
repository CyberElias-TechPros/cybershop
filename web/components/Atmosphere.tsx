'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * The living layer: custom cursor, particle field, mouse-follow lighting,
 * magnetic CTAs, and a scroll progress filament.
 *
 * Skipped entirely for reduced-motion users and for dense dashboards. The
 * intro curtain itself is server-rendered in app/layout.tsx (it has to cover
 * the *first* paint — a client-mounted curtain lands on top of content that is
 * already readable and blanks the screen for a second); this module only
 * retires it early when the visitor starts interacting.
 */

function reduced() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function finePointer() {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
}

/**
 * The particle field is a full-screen canvas repainted every frame with an
 * O(n²) link pass — fine on a laptop, a battery/jank tax on the mid-range
 * Androids most of this market is on. Skip it where it cannot be enjoyed
 * (no pointer to follow, small screen, data saver, low-memory device) and
 * throttle it everywhere else.
 */
function fieldWorthItsCost() {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    deviceMemory?: number;
  };
  if (nav.connection?.saveData) return false;
  const et = nav.connection?.effectiveType;
  if (et === 'slow-2g' || et === '2g') return false;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) return false;
  if (!finePointer()) return false; // the field follows the cursor; touch has none
  if (window.innerWidth < 720) return false;
  return true;
}

export default function Atmosphere() {
  const pathname = usePathname();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workbench = pathname.startsWith('/dashboard') || pathname.startsWith('/admin');
  const [field, setField] = useState(false);

  /* Decide once, on the client: is the animated field worth its cost here? */
  useEffect(() => {
    setField(!workbench && !reduced() && fieldWorthItsCost());
  }, [workbench]);

  /* ----- retire the server-rendered intro curtain early ----- */
  useEffect(() => {
    if (workbench) return;
    const el = document.querySelector('.cine-intro');
    if (!el) return;
    const drop = () => {
      el.remove();
      window.removeEventListener('pointerdown', drop);
      window.removeEventListener('keydown', drop);
      window.removeEventListener('wheel', drop);
    };
    el.addEventListener('animationend', drop, { once: true });
    window.addEventListener('pointerdown', drop, { passive: true });
    window.addEventListener('keydown', drop);
    window.addEventListener('wheel', drop, { passive: true });
    const failSafe = setTimeout(drop, 2000);
    return () => {
      clearTimeout(failSafe);
      el.removeEventListener('animationend', drop);
      window.removeEventListener('pointerdown', drop);
      window.removeEventListener('keydown', drop);
      window.removeEventListener('wheel', drop);
    };
  }, [workbench]);

  /* ----- canvas particle field ----- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !field) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    let raf = 0;
    let running = true;
    let mx = 0.5;
    let my = 0.35;

    type P = { x: number; y: number; vx: number; vy: number; r: number; a: number; gold: boolean };
    let pts: P[] = [];

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(72, Math.floor((w * h) / 24000));
      pts = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: 0.6 + Math.random() * 1.6,
        a: 0.18 + Math.random() * 0.45,
        gold: Math.random() > 0.62,
      }));
    };

    const onMove = (e: PointerEvent) => {
      mx = e.clientX / (w || 1);
      my = e.clientY / (h || 1);
    };

    // ~30fps: the field is ambience, not a game — half the frames, half the cost
    let last = 0;
    const tick = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      if (now - last < 32) return;
      last = now;
      ctx.clearRect(0, 0, w, h);
      const px = mx * w;
      const py = my * h;
      for (const p of pts) {
        p.x += p.vx + (px - p.x) * 0.00035;
        p.y += p.vy + (py - p.y) * 0.00035;
        if (p.x < -8) p.x = w + 8;
        if (p.x > w + 8) p.x = -8;
        if (p.y < -8) p.y = h + 8;
        if (p.y > h + 8) p.y = -8;
        ctx.beginPath();
        ctx.fillStyle = p.gold ? `rgba(242,200,121,${p.a})` : `rgba(44,229,142,${p.a * 0.85})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      // link pass only when the field is small enough to stay cheap
      if (pts.length <= 56) {
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) {
            const a = pts[i]!;
            const b = pts[j]!;
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < 140 * 140) {
              const alpha = (1 - Math.sqrt(d2) / 140) * 0.09;
              ctx.strokeStyle = `rgba(237,245,241,${alpha})`;
              ctx.lineWidth = 0.6;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }
      }
    };

    const onVisibility = () => {
      const keep = document.visibilityState === 'visible';
      if (keep === running) return;
      running = keep;
      if (running) raf = requestAnimationFrame(tick);
      else cancelAnimationFrame(raf);
    };

    resize();
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [field]);

  /* ----- cursor + spotlight + magnetic + progress ----- */
  useEffect(() => {
    if (reduced() || workbench) return;
    const root = document.documentElement;
    root.classList.add('cine-on');
    const fine = finePointer();

    const dot = document.createElement('div');
    const ring = document.createElement('div');
    dot.className = 'cine-dot';
    ring.className = 'cine-ring';
    const bar = document.createElement('div');
    bar.className = 'cine-progress';
    bar.setAttribute('aria-hidden', 'true');
    if (fine) {
      document.body.append(dot, ring);
    }
    document.body.append(bar);

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let rx = x;
    let ry = y;
    let raf = 0;
    let hover = false;

    const loop = () => {
      rx += (x - rx) * 0.18;
      ry += (y - ry) * 0.18;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) scale(${hover ? 1.85 : 1})`;
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      raf = requestAnimationFrame(loop);
    };
    /* Hiding the native cursor is only safe once the replacement is actually
       on screen and tracking — otherwise a failed effect leaves the visitor
       with no cursor at all. */
    if (fine) {
      raf = requestAnimationFrame(loop);
      root.classList.add('cine-cursor');
    }

    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      root.style.setProperty('--spot-x', `${e.clientX}px`);
      root.style.setProperty('--spot-y', `${e.clientY}px`);
      const t = e.target as Element | null;
      const mag = t?.closest?.('.btn, a.card, .cine-magnet, .cat-card') as HTMLElement | null;
      hover = Boolean(mag);
      ring.classList.toggle('hot', hover);

      if (fine && mag && mag.matches('.btn')) {
        const r = mag.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        mag.style.transform = `translate(${dx * 0.18}px, ${dy * 0.22}px)`;
        mag.dataset.mag = '1';
      }
      document.querySelectorAll<HTMLElement>('.btn[data-mag="1"]').forEach((el) => {
        if (el !== mag) {
          el.style.transform = '';
          delete el.dataset.mag;
        }
      });
    };

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? window.scrollY / max : 0;
      bar.style.transform = `scaleX(${p})`;
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', onScroll);
      root.classList.remove('cine-on', 'cine-cursor');
      root.style.removeProperty('--spot-x');
      root.style.removeProperty('--spot-y');
      dot.remove();
      ring.remove();
      bar.remove();
      document.querySelectorAll<HTMLElement>('.btn[data-mag]').forEach((el) => {
        el.style.transform = '';
        delete el.dataset.mag;
      });
    };
  }, [workbench, pathname]);

  if (!field) return null;
  return <canvas ref={canvasRef} className="cine-field" aria-hidden="true" />;
}
