/**
 * Types mirroring the Worker's public API responses (src/routes/public.ts).
 * Keep in sync with the Worker — the Worker is the source of truth.
 */

export interface CategoryOut {
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
}

export interface BusinessOut {
  id: number;
  name: string;
  slug: string;
  about: string | null;
  city: string | null;
  state_region: string | null;
  phone: string | null;
  website: string | null;
  social: Record<string, string>;
  status: string;
  verification_status?: string;
  created_at?: string | null;
  listing_count?: number;
  whatsapp_number?: string | null;
  categories: { name: string; slug: string; icon: string | null }[];
  logo: { url: string; alt: string } | null;
  cover: { url: string } | null;
  premium?: {
    chat: boolean;
    escrow: boolean;
    jobs: boolean;
    verified_id: boolean;
    reply: string | null;
  };
}

export interface ItemImageOut {
  id: number;
  url: string;
  width: number | null;
  height: number | null;
  alt: string;
  primary: boolean;
}

export interface ItemOut {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  price_kobo: number | null;
  price_display: string;
  price_type: 'fixed' | 'from' | 'negotiable' | 'free';
  currency: string;
  stock_status: string;
  custom_fields: Record<string, unknown>;
  images: ItemImageOut[];
  url_segment: string;
  cta_label: string;
  /** Vendor voice note (item page only). */
  audio?: { url: string; size_bytes: number } | null;
  schema_type?: string;
  seo: { title: string; description: string | null };
  published_at: string | null;
  views?: number;
  featured?: boolean;
  type_slug?: string;
  inspection?: { notes: string } | null;
}

export interface OfferOut {
  id: number;
  title: string;
  description: string | null;
  kind: string;
  value: string | null;
  value_type: string;
  ends_at: string | null;
}

export interface HomeOut {
  platform: { name: string; tagline: string; currency: string; support_email: string } | null;
  categories: CategoryOut[];
  businesses: BusinessOut[];
  business_count: number;
}

export interface BusinessesOut {
  businesses: BusinessOut[];
  total: number;
  page: number;
  pages: number;
}

export interface CategoryPageOut {
  category: { name: string; slug: string; description: string | null; icon: string | null };
  businesses: BusinessOut[];
  page: number;
  pages: number;
}

export interface BusinessPageOut {
  business: BusinessOut;
  items: ItemOut[];
  offers: OfferOut[];
}

export interface WaOut {
  url: string | null;
  number: string | null;
  message: string;
}

export interface ItemPageOut {
  item: ItemOut;
  business: BusinessOut;
  wa: WaOut;
  related: ItemOut[];
  similar?: (ItemOut & { biz_slug?: string; biz_name?: string; city?: string | null })[];
}

export interface MarketListing {
  id: number;
  name: string;
  slug: string;
  url_segment: string;
  biz_slug: string;
  biz_name: string;
  city: string | null;
  verified?: boolean;
  boosted?: boolean;
  type_slug?: string;
  published_at?: string | null;
  price_kobo?: number | null;
  price_display: string;
  image: string | null;
}

export interface ListingsOut {
  items: MarketListing[];
  total: number;
  page: number;
  pages: number;
}

export interface SearchOut {
  businesses: { id: number; name: string; slug: string; city: string | null }[];
  items: {
    id: number;
    name: string;
    slug: string;
    url_segment: string;
    biz_slug: string;
    biz_name: string;
    city?: string | null;
    price_display: string;
    image: string | null;
  }[];
  total: number;
  page: number;
}
