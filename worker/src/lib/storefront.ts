/**
 * Store themes: curated looks named after the trade, not abstract style
 * words. A buyer recognises a Boutique, a Kitchen or an Academy instantly;
 * nobody recognises "editorial". The vendor picks a theme key (or 'auto',
 * which resolves from the store's categories on the web side); palettes,
 * catalogue nouns and hero treatments live in web/lib/theme.ts so every
 * preset is contrast-checked once, centrally — there is deliberately no
 * free-form colour input any more (the old arbitrary accent hex produced
 * unreadable stores and is now ignored on render).
 *
 * Legacy values ('classic' | 'editorial' | 'minimal' | 'bold') written by
 * the old settings UI parse to 'auto' — no migration, existing stores just
 * get their category's theme.
 */
export const STORE_THEMES = ['auto', 'boutique', 'kitchen', 'gadget', 'academy', 'property', 'general'] as const;
export type StoreTheme = (typeof STORE_THEMES)[number];

/** @deprecated old abstract style names — kept only so old code compiles. */
export const STOREFRONT_STYLES = STORE_THEMES;

export const SECTION_KEYS = ['hero', 'featured', 'offers', 'about', 'gallery', 'faq', 'location'] as const;

export interface Storefront {
  /** Theme key ('auto' = follow the store's category). Field kept as
   *  `style` in stored JSON for backwards compatibility. */
  style: StoreTheme;
  /** @deprecated free-form accent hex — parsed for compatibility, not rendered. */
  accent: string;
  sections: Record<(typeof SECTION_KEYS)[number], boolean>;
  faq: { q: string; a: string }[];
  hours: string | null;
}

const DEFAULT_SECTIONS: Storefront['sections'] = {
  hero: true,
  featured: true,
  offers: true,
  about: true,
  gallery: true,
  faq: false,
  location: true,
};

export function defaultStorefront(): Storefront {
  return { style: 'auto', accent: '', sections: { ...DEFAULT_SECTIONS }, faq: [], hours: null };
}

function hexColor(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : '';
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s) ? s : '';
}

/** Vendor-controlled storefront. WhatsApp contact cannot be turned off. */
export function parseStorefront(raw: string | null | undefined): Storefront {
  const out = defaultStorefront();
  if (!raw) return out;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return out; }
  if (!parsed || typeof parsed !== 'object') return out;
  const o = parsed as Record<string, unknown>;
  // New key wins; the legacy `style` key is where older rows (and the
  // current settings payload) keep it. Anything unknown — including the
  // old classic/editorial/minimal/bold names — resolves to 'auto'.
  const themeRaw = typeof o.theme === 'string' ? o.theme : o.style;
  if (STORE_THEMES.includes(themeRaw as StoreTheme)) out.style = themeRaw as StoreTheme;
  out.accent = hexColor(o.accent);
  if (o.sections && typeof o.sections === 'object') {
    for (const key of SECTION_KEYS) {
      const v = (o.sections as Record<string, unknown>)[key];
      if (typeof v === 'boolean') out.sections[key] = v;
    }
  }
  if (Array.isArray(o.faq)) {
    out.faq = o.faq.slice(0, 8).map((row) => {
      const r = row as { q?: unknown; a?: unknown };
      return {
        q: typeof r.q === 'string' ? r.q.trim().slice(0, 120) : '',
        a: typeof r.a === 'string' ? r.a.trim().slice(0, 500) : '',
      };
    }).filter((r) => r.q.length >= 2 && r.a.length >= 2);
  }
  out.hours = typeof o.hours === 'string' && o.hours.trim() ? o.hours.trim().slice(0, 200) : null;
  return out;
}
