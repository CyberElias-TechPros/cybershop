import { ImageResponse } from 'next/og';
import { OgCard, OG_SIZE, OG_CONTENT_TYPE, ogFonts } from '@/lib/og-card';
import { api } from '@/lib/api';
import { absUrl } from '@/lib/config';
import type { BusinessOut, ItemOut } from '@/lib/types';

export const alt = 'CyberShop store';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

interface Page {
  business: BusinessOut;
  items: ItemOut[];
  offers: unknown[];
}

/** The store card: who they are, where they are, and how much they have on show. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let data: Page | null = null;
  try {
    data = await api<Page>(`/public/business/${encodeURIComponent(slug)}`);
  } catch {
    data = null;
  }
  const b = data?.business;
  const image = b?.cover?.url || b?.logo?.url || data?.items?.[0]?.images?.[0]?.url || null;

  const card = (img: string | null) =>
    OgCard({
      kicker: 'Store on CyberShop',
      title: (b?.name ?? 'Store').slice(0, 60),
      price: null,
      meta: [
        b?.city ?? b?.state_region ?? 'Nigeria',
        b?.categories?.slice(0, 2).map((c) => c.name).join(', ') ?? '',
        b?.listing_count ? `${b.listing_count} listing${b.listing_count === 1 ? '' : 's'}` : '',
        b?.reviews?.count ? `${b.reviews.average}★ (${b.reviews.count})` : '',
      ].filter(Boolean),
      image: img,
      badge: b?.is_platform_owner
        ? 'Official CyberShop store'
        : b?.verification_status === 'verified'
          ? 'Verified vendor'
          : null,
    });

  if (image) {
    const absolute = absUrl(image);
    if (/^https?:\/\//.test(absolute)) {
      try {
        return new ImageResponse(card(absolute), { ...OG_SIZE, fonts: ogFonts() });
      } catch {
        /* fall through */
      }
    }
  }
  return new ImageResponse(card(null), { ...OG_SIZE, fonts: ogFonts() });
}
