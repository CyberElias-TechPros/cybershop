'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode, type CSSProperties, type ElementType } from 'react';

/**
 * Scroll-reveal: fades/rises content in when it enters the viewport.
 * Progressive enhancement only — without JS (or with reduced motion) the
 * content is fully visible; the CSS hides .reveal solely under html.js.
 */
export function Reveal({
  children,
  as: Tag = 'div',
  i = 0,
  className = '',
  style,
  ...rest
}: {
  children: ReactNode;
  as?: ElementType;
  /** stagger index (×70ms) */
  i?: number;
  className?: string;
  style?: CSSProperties;
} & Record<string, unknown>) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('is-in');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            en.target.classList.add('is-in');
            io.unobserve(en.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Comp = Tag as 'div';
  return (
    <Comp
      ref={ref as never}
      className={`reveal ${className}`.trim()}
      style={{ ...(style ?? undefined), ['--i' as string]: i } as CSSProperties}
      {...rest}
    >
      {children}
    </Comp>
  );
}

/** Counts up from 0 when scrolled into view (instant with reduced motion). */
export function CountUp({ value, className = '' }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value < 100 ? 0 : 0);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const run = () => {
      if (done.current) return;
      done.current = true;
      if (reduced || value < 10) {
        setDisplay(value);
        return;
      }
      const t0 = performance.now();
      const dur = 1100;
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        setDisplay(Math.round(value * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          run();
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {display.toLocaleString('en-NG')}
    </span>
  );
}

/** Splits text into per-word spans for the hero word-reveal animation. */
export function HeroWords({ text }: { text: string }) {
  const words = text.split(' ');
  return (
    <>
      {words.map((w, i) => (
        <span key={i} className="w" style={{ ['--i' as string]: i } as CSSProperties}>
          {w}
        </span>
      ))}
    </>
  );
}

/**
 * Subtle parallax for the hero aurora: shifts with scroll (desktop only,
 * disabled with reduced motion). Pure transform — no layout work.
 */
export function AuroraParallax() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia('(min-width: 760px)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = `translate3d(0, ${window.scrollY * -0.06}px, 0)`;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className="aurora" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

/**
 * Cinematic page transition: a dark gradient veil sweeps in as the route
 * changes, then lifts — a lightweight crossfade that works in every browser
 * (React's built-in <ViewTransition> does not interop under Next's server
 * component transform in this build). Skipped on the first render and for
 * users who prefer reduced motion.
 */
export function TransitionFx() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<'idle' | 'cover' | 'reveal'>('idle');
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setPhase('cover');
    const t1 = setTimeout(() => setPhase('reveal'), 240);
    const t2 = setTimeout(() => setPhase('idle'), 860);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pathname]);

  if (phase === 'idle') return null;
  return <div className={`page-veil ${phase}`} aria-hidden="true" />;
}

/** Adds html.hdr-scrolled once the page is scrolled (header condenses). */
export function HeaderFx() {
  useEffect(() => {
    const onScroll = () => {
      document.documentElement.classList.toggle('hdr-scrolled', window.scrollY > 24);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return null;
}
