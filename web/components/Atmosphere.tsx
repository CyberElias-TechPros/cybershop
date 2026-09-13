'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * The living layer: intro curtain, custom cursor, particle field,
 * mouse-follow lighting, magnetic CTAs, and a scroll progress filament.
 * Skipped entirely for reduced-motion users and for dense dashboards.
 */

function reduced() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function finePointer() {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
}

export default function Atmosphere() {
  const pathname = usePathname();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [intro, setIntro] = useState(false);
  const workbench = pathname.startsWith('/dashboard') || pathname.startsWith('/admin');

  useEffect(() => {
    if (reduced() || workbench) return;
    try {
      if (sessionStorage.getItem('cs-intro') === '1') return;
      sessionStorage.setItem('cs-intro', '1');
    } catch {
      /* private mode */
    }
    setIntro(true);
    const t = setTimeout(() => setIntro(false), 2200);
    return () => clearTimeout(t);
  }, [workbench]);

  /* ----- canvas particle field ----- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reduced() || workbench) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    let raf = 0;
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
      const n = Math.min(92, Math.floor((w * h) / 18000));
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
      mx = e.clientX / w;
      my = e.clientY / h;
    };

    const tick = () => {
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
      raf = requestAnimationFrame(tick);
    };

    resize();
    tick();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
    };
  }, [workbench]);

  /* ----- cursor + spotlight + magnetic + progress ----- */
  useEffect(() => {
    if (reduced() || workbench) return;
    const root = document.documentElement;
    root.classList.add('cine-on');
    if (finePointer()) root.classList.add('cine-cursor');

    const dot = document.createElement('div');
    const ring = document.createElement('div');
    dot.className = 'cine-dot';
    ring.className = 'cine-ring';
    const bar = document.createElement('div');
    bar.className = 'cine-progress';
    bar.setAttribute('aria-hidden', 'true');
    if (finePointer()) {
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
    if (finePointer()) loop();

    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      root.style.setProperty('--spot-x', `${e.clientX}px`);
      root.style.setProperty('--spot-y', `${e.clientY}px`);
      const t = e.target as Element | null;
      const mag = t?.closest?.('.btn, a.card, .cine-magnet, .cat-card') as HTMLElement | null;
      hover = Boolean(mag);
      ring.classList.toggle('hot', hover);

      if (mag && mag.matches('.btn') && finePointer()) {
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
      dot.remove();
      ring.remove();
      bar.remove();
      document.querySelectorAll<HTMLElement>('.btn[data-mag]').forEach((el) => {
        el.style.transform = '';
        delete el.dataset.mag;
      });
    };
  }, [workbench, pathname]);

  return (
    <>
      {!workbench && <canvas ref={canvasRef} className="cine-field" aria-hidden="true" />}
      {intro && (
        <div className="cine-intro" aria-hidden="true">
          <div className="cine-intro-line" />
          <p className="cine-intro-mark">
            Cyber<span>Shop</span>
          </p>
          <p className="cine-intro-sub">The night market, always open</p>
        </div>
      )}
    </>
  );
}
