'use client';

import { useState } from 'react';
import type { ItemImageOut } from '@/lib/types';

export default function Gallery({ images, name }: { images: ItemImageOut[]; name: string }) {
  const [active, setActive] = useState(() => {
    const p = images.findIndex((i) => i.primary);
    return p >= 0 ? p : 0;
  });
  if (images.length === 0) {
    return (
      <div className="main-img" role="img" aria-label={name}>
        <div className="no-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '3rem', color: '#b7c6c1' }}>
          🏷️
        </div>
      </div>
    );
  }
  const img = images[active]!;
  return (
    <div className="gallery">
      <div className="main-img">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.url} alt={img.alt} width={img.width ?? undefined} height={img.height ?? undefined} />
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
