import { ImageResponse } from 'next/og';
import { OgCard, OG_SIZE, OG_CONTENT_TYPE, ogFonts } from '@/lib/og-card';
import { api } from '@/lib/api';

export const alt = 'CyberShop — find a business and talk to it on WhatsApp';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * The card shown when anyone pastes the bare domain into WhatsApp, X or iMessage.
 * The counts are live, which is the most honest thing a marketplace can put on
 * its own business card.
 */
export default async function Image() {
  let stores = 0;
  try {
    const d = await api<{ business_count?: number }>('/public/home');
    stores = Number(d.business_count ?? 0);
  } catch {
    /* a stale count is not worth failing the card over */
  }
  const fmt = (n: number) => (n > 0 ? n.toLocaleString('en-NG') : '');

  return new ImageResponse(
    OgCard({
      kicker: 'Nigerian marketplace',
      title: 'Every store near you, one WhatsApp away',
      meta: [stores ? `${fmt(stores)} stores in the market` : '', 'Verify before you pay'].filter(Boolean),
      badge: null,
      image: null,
    }),
    { ...OG_SIZE, fonts: ogFonts() }
  );
}
