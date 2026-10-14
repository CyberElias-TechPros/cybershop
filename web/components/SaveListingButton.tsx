'use client';

import { useEffect, useState } from 'react';
import { isSaved, toggleSaved, type SavedAd } from '@/lib/saved';
import { haptic } from '@/lib/haptics';

/**
 * Save/unsave a listing from its card. Rendered as a *sibling* of the card's
 * stretched link (never nested inside it) so the jsx-nesting audit stays
 * green and screen-reader/keyboard users get a real, labelled button.
 */
export default function SaveListingButton({ ad }: { ad: Omit<SavedAd, 'saved_at'> }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const sync = () => setSaved(isSaved(ad.listing_id));
    sync();
    window.addEventListener('cs-saved', sync);
    return () => window.removeEventListener('cs-saved', sync);
  }, [ad.listing_id]);

  return (
    <button
      type="button"
      className={`btn-save${saved ? ' is-saved' : ''}`}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${ad.name} from saved` : `Save ${ad.name}`}
      title={saved ? 'Saved — tap to remove' : 'Save for later'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setSaved(toggleSaved(ad));
        haptic('pop');
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
