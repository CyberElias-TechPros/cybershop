/**
 * Guest-friendly saved ads + recently viewed (Jiji-style).
 * Login is optional — this is localStorage only. The inquiry POST is still
 * the only server write a buyer must make.
 */

export interface SavedAd {
  listing_id: number;
  name: string;
  price_display: string;
  image: string | null;
  biz_name: string;
  biz_slug: string;
  url_segment: string;
  slug: string;
  city: string | null;
  saved_at: number;
}

const SAVED = 'cs-saved-v1';
const RECENT = 'cs-recent-v1';
const MAX_SAVED = 80;
const MAX_RECENT = 24;

function read<T>(key: string): T[] {
  try {
    const j = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(j) ? (j as T[]) : [];
  } catch {
    return [];
  }
}

function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* quota / private mode */
  }
  window.dispatchEvent(new CustomEvent('cs-saved'));
}

export function listSaved(): SavedAd[] {
  return read<SavedAd>(SAVED).sort((a, b) => b.saved_at - a.saved_at);
}

export function isSaved(listingId: number): boolean {
  return listSaved().some((s) => s.listing_id === listingId);
}

export function toggleSaved(ad: Omit<SavedAd, 'saved_at'>): boolean {
  const all = listSaved();
  const i = all.findIndex((s) => s.listing_id === ad.listing_id);
  if (i >= 0) {
    all.splice(i, 1);
    write(SAVED, all);
    return false;
  }
  write(SAVED, [{ ...ad, saved_at: Date.now() }, ...all].slice(0, MAX_SAVED));
  return true;
}

export function removeSaved(listingId: number) {
  write(SAVED, listSaved().filter((s) => s.listing_id !== listingId));
}

export function listRecent(): SavedAd[] {
  return read<SavedAd>(RECENT);
}

export function pushRecent(ad: Omit<SavedAd, 'saved_at'>) {
  const rest = listRecent().filter((s) => s.listing_id !== ad.listing_id);
  write(RECENT, [{ ...ad, saved_at: Date.now() }, ...rest].slice(0, MAX_RECENT));
}

export function adHref(ad: Pick<SavedAd, 'biz_slug' | 'url_segment' | 'slug'>): string {
  return `/business/${ad.biz_slug}/${ad.url_segment}/${ad.slug}`;
}
