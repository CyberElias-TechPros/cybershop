'use client';

import { useEffect } from 'react';

/** Production-only offline shell. Dev stays untouched so HMR is not cached. */
export default function OfflineSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);
  return null;
}
