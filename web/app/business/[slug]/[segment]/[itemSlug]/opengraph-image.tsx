import { ImageResponse } from 'next/og';
import { OgCard, OG_SIZE, OG_CONTENT_TYPE, ogFonts } from '@/lib/og-card';
import { api } from '@/lib/api';
import { absUrl } from '@/lib/config';
import type { ItemPageOut } from '@/lib/types';

export const alt = 'CyberShop listing';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

interface SP { slug: string; segment: string; itemSlug: string }

async function fetchItem(sp: SP) {
  return api<ItemPageOut>(
    `/public/item?biz=${encodeURIComponent(sp.slug)}&segment=${encodeURIComponent(sp.segment)}&slug=${encodeURIComponent(sp.itemSlug)}`
  );
}

/**
 * The card a buyer sees when a vendor drops a listing into a WhatsApp group.
 *
 * Photo on the right, price big on the left. If the photo cannot be fetched
 * (a vendor deleted it, or MEDIA_BASE_URL points somewhere unreachable) we
 * render the same card without it rather than returning a broken image — a
 * share that 500s is worse than a share with no photo.
 */
export default async function Image({ params }: { params: Promise<SP> }) {
  const sp = await params;
  let data: ItemPageOut | null = null;
  try {
    data = await fetchItem(sp);
  } catch {
    data = null;
  }
  const item = data?.item;
  const business = data?.business;

  const image = item?.images?.[0]?.url || business?.cover?.url || business?.logo?.url || null;
  const title = (item?.name ?? 'Listing').slice(0, 90);
  const price = item?.price_display && !/on request/i.test(item.price_display) ? item.price_display : null;

  const card = (img: string | null) =>
    OgCard({
      kicker: business?.name ?? 'CyberShop',
      title,
      price,
      meta: [
        business?.city ?? business?.state_region ?? '',
        item?.type_slug ? String(item.type_slug).replace('-', ' ') : '',
        item?.stock_status === 'out_of_stock' ? 'Sold out' : '',
      ].filter(Boolean),
      image: img,
      badge: business?.is_platform_owner
        ? 'Official CyberShop store'
        : business?.verification_status === 'verified'
          ? 'Verified vendor'
          : null,
    });

  if (image) {
    const absolute = absUrl(image);
    if (/^https?:\/\//.test(absolute)) {
      try {
        return new ImageResponse(card(absolute), { ...OG_SIZE, fonts: ogFonts() });
      } catch {
        /* fall through to the photo-less card */
      }
    }
  }
  return new ImageResponse(card(null), { ...OG_SIZE, fonts: ogFonts() });
}
