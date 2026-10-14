import { permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';

/*
 * One shop, one search. This route used to be a second, different search
 * (mixed businesses + items, capped, no price/stock filters) living beside
 * /listings. It now forwards — permanently — into the unified shop feed,
 * preserving query and city. Old bookmarks, shared links and indexed URLs
 * keep working; nobody has to learn two result pages.
 */

export const metadata: Metadata = { title: 'Search', robots: { index: false, follow: true } };

interface SP {
  q?: string;
  city?: string;
  [key: string]: string | undefined;
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v) u.set(k, v);
  }
  const s = u.toString();
  permanentRedirect(s ? `/listings?${s}` : '/listings');
}
