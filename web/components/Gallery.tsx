'use client';

import { useState } from 'react';
import type { ItemImageOut } from '@/lib/types';

/**
 * Item gallery. The main image frame is the flip target for the
 * shared-element card↔detail transition (`flipId`), and the swipe-down
 * surface for the reverse gesture (same id).
 */
export default function Gallery({ images, name, flipId }: { images: ItemImageOut[]; name: string; flipId?: string }) {
  const [active, setActive] = useState(() => {
    const p = images.findIndex((i) => i.primary);
    return p >= 0 ? p : 0;
  });
  if (images.length === 0) {
    return (
      <div
        className="main-img"
        role="img"
        aria-label={name}
        {...(flipId ? { 'data-flip-target': flipId, 'data-flip-close': flipId } : {})}
      >
        <span className="skel" aria-hidden="true" />
        <div className="no-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '3rem', color: 'var(--ink-faint)' }}>
          🏷️
        </div>
      </div>
    );
  }
  const img = images[active]!;
  return (
    <div className="gallery">
      <div
        className="main-img fade-swap"
        {...(flipId ? { 'data-flip-target': flipId, 'data-flip-close': flipId } : {})}
      >
        <span className="skel" aria-hidden="true" />
        {/* key={img.id} re-mounts on change → crossfade animation */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={img.id} src={img.url} alt={img.alt} width={img.width ?? undefined} height={img.height ?? undefined} />
      </div>
      {images.length > 1 && (
        <div className="thumbs">
          {images.map((im, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={im.id}
              src={im.url}
              alt={im.alt}
              className={i === active ? 'active' : ''}
              onClick={() => setActive(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
