'use client';

import { useEffect, useState } from 'react';

interface Props {
  name: string;
  waUrl: string | null;
  ctaLabel?: string;
  /** px of scroll before the bar appears */
  after?: number;
}

/**
 * Sticky bottom WhatsApp bar for storefronts — slides up once the buyer has
 * scrolled past the hero, so "talk to the owner" is always one tap away.
 */
export default function StickyWa({ name, waUrl, ctaLabel, after = 420 }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > after);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [after]);

  if (!waUrl) return null;

  return (
    <div className={`sticky-wa${visible ? ' visible' : ''}`} aria-hidden={!visible}>
      <div className="inner">
        <span className="name">
          <span className="pulse-dot" aria-hidden="true" />
          {name}
        </span>
        <a className="btn btn-wa sheen" href={waUrl} target="_blank" rel="noopener">
          💬 {ctaLabel ?? 'Chat now'}
        </a>
      </div>
    </div>
  );
}
