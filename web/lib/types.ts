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
  /** Median first-reply time from real enquiries (null until 5+ samples). */
  response_time?: { hours: number; sample: number } | null;
  paused?: boolean;
  featured?: boolean;
  /** The platform owner's own store (Cyber Elias Academy) — free, permanent top plan. */
  is_platform_owner?: boolean;
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
  reviews?: { count: number; average: number | null };
  address?: string | null;
  storefront?: {
    /** Store theme key: 'auto' (follow category) or a trade theme key
     *  (boutique | kitchen | gadget | academy | property | general).
     *  See web/lib/theme.ts. Legacy style names resolve to 'auto'. */
    style: string;
    /** @deprecated free-form accent — no longer rendered; themes are curated. */
    accent: string;
    sections: Record<string, boolean>;
    faq: { q: string; a: string }[];
    hours: string | null;
  };
}

/** A plan granted to a store permanently, at no cost. See worker/src/lib/entitlement.ts. */
export interface Entitlement {
  plan_slug: string | null;
  plan_name: string | null;
  reason: string | null;
  granted_at: string | null;
  is_platform_owner: boolean;
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
  variants?: { id: number; name: string; options: string[]; price_kobo: number | null; price_display: string | null; stock_qty: number | null }[];
  reviews?: {
    count: number;
    average: number | null;
    items?: { id: number; rating: number; title: string | null; body: string | null; vendor_reply: string | null; created_at: string; buyer_name: string }[];
  };
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
  platform: { name: string; tagline: string; currency: string; support_email: string; announcement?: string } | null;
  categories: CategoryOut[];
  businesses: BusinessOut[];
  business_count: number;
  /** The shop feed — fresh listings across the whole market. */
  listings: MarketListing[];
  featured_listings: MarketListing[];
  listing_count: number;
  cities: { city: string; n: number }[];
}

export interface SellOut {
  plans: { name: string; slug: string; description: string | null; price_kobo: number; price_display: string; interval: string; features: string[] }[];
  addons: { name: string; slug: string; description: string | null; price_kobo: number; price_display: string }[];
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
  /** Listings first — a category is a shop aisle, not only a directory. */
  listings: MarketListing[];
  listing_total: number;
  page: number;
  pages: number;
}

export interface BusinessPageOut {
  business: BusinessOut;
  items: ItemOut[];
  offers: OfferOut[];
  unavailable?: boolean;
  preview?: boolean;
  unavailable_reason?: string | null;
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
  similar?: (ItemOut & { biz_slug?: string; biz_name?: string; biz_logo?: string | null; city?: string | null })[];
}

export interface MarketListing {
  id: number;
  name: string;
  slug: string;
  url_segment: string;
  biz_slug: string;
  biz_name: string;
  business_id?: number;
  /** Store profile photo — the face of the seller on every card. */
  biz_logo?: string | null;
  city: string | null;
  /** Seller's identity has been checked by CyberShop (not "paid to rank"). */
  verified?: boolean;
  /** Seller paid to feature this listing. Labelled, never disguised. */
  boosted?: boolean;
  type_slug?: string;
  category_slug?: string | null;
  category_name?: string | null;
  published_at?: string | null;
  price_kobo?: number | null;
  price_type?: string;
  stock_status?: string;
  /** The store's published-review summary. average is null until count > 0. */
  rating?: { average: number | null; count: number };
  price_display: string;
  image: string | null;
}

export interface ListingsOut {
  items: MarketListing[];
  total: number;
  page: number;
  pages: number;
  field_filters?: { key: string; label: string; options: string[] }[];
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
  suggestions?: { label: string; href: string }[];
}
