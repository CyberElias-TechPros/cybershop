/**
 * Store themes — curated looks named after the trade, so a buyer knows
 * what kind of business they are looking at before they read a word.
 *
 * A theme is more than a colour: it carries the catalogue noun ("The
 * Menu", "Courses", "Properties"), a hero treatment and a logo shape,
 * rendered via [data-store="<key>"] rules in globals.css. The platform
 * chrome (header, trust badges, WhatsApp-green CTA) never changes —
 * vendors get personality inside their store; buyers keep their bearings
 * across stores.
 *
 * Vendors choose a key in Dashboard → Settings ('auto' = follow the
 * store's category, which is also what legacy classic/editorial/minimal/
 * bold stores resolve to). There is no free-form colour: every palette
 * here is contrast-checked once, centrally.
 *
 * Pure server-safe (no 'use client') — used to set CSS custom properties
 * inline on page roots.
 */

export type StoreThemeKey = 'boutique' | 'kitchen' | 'gadget' | 'academy' | 'property' | 'general';

export interface StoreThemeDef {
  key: StoreThemeKey;
  /** Human name shown in the picker and (quietly) on the storefront. */
  name: string;
  /** Who it is for — picker helper text. */
  for: string;
  icon: string;
  /** Primary accent / secondary accent (gradients, glow). */
  acc: string;
  acc2: string;
  /** What the catalogue is called on this kind of store. */
  noun: string;
}

export const STORE_THEMES: Record<StoreThemeKey, StoreThemeDef> = {
  boutique: {
    key: 'boutique', name: 'Boutique', for: 'Fashion, beauty, hair & style', icon: '👗',
    acc: '#f083a8', acc2: '#b07fe8', noun: 'The Collection',
  },
  kitchen: {
    key: 'kitchen', name: 'Kitchen', for: 'Food, restaurants, bakeries & drinks', icon: '🍽️',
    acc: '#f0a35c', acc2: '#e2703a', noun: 'The Menu',
  },
  gadget: {
    key: 'gadget', name: 'Gadget Hub', for: 'Phones, electronics, computers & autos', icon: '📱',
    acc: '#4f8cff', acc2: '#2ce5e5', noun: 'The Line-up',
  },
  academy: {
    key: 'academy', name: 'Academy', for: 'Courses, training, schools & coaching', icon: '🎓',
    acc: '#7c8cff', acc2: '#8b5cf6', noun: 'Courses & Programmes',
  },
  property: {
    key: 'property', name: 'Property', for: 'Real estate, land, homes & spaces', icon: '🏠',
    acc: '#2fbfa7', acc2: '#7bc47f', noun: 'Properties & Spaces',
  },
  general: {
    key: 'general', name: 'General Store', for: 'Services, retail & everything else', icon: '🛍️',
    acc: '#2ce58e', acc2: '#f2c879', noun: 'The Catalogue',
  },
};

/** Picker order (auto is rendered separately by the settings UI). */
export const STORE_THEME_LIST: StoreThemeDef[] = [
  STORE_THEMES.boutique, STORE_THEMES.kitchen, STORE_THEMES.gadget,
  STORE_THEMES.academy, STORE_THEMES.property, STORE_THEMES.general,
];

const RULES: { re: RegExp; key: StoreThemeKey }[] = [
  // Academy before Gadget: "Tech Academy" is a school first, a tech shop second.
  { re: /(academy|course|training|school|coaching|tutor|education|bootcamp)/i, key: 'academy' },
  { re: /(fashion|beauty|hair|nail|style|apparel|makeup|spa|salon|clothing|boutique)/i, key: 'boutique' },
  { re: /(food|bakery|restaurant|kitchen|cuisine|eat|cafe|drink|catering)/i, key: 'kitchen' },
  { re: /(real-?estate|property|land|building|construction|housing|rent)/i, key: 'property' },
  { re: /(tech|electronic|phone|gadget|computer|digital|software|car|auto|vehicle|motor)/i, key: 'gadget' },
];

/** The theme a store's categories point to (used for 'auto' and previews). */
export function themeForCategories(cats: { slug: string; name: string }[] | null | undefined): StoreThemeDef {
  if (!cats || cats.length === 0) return STORE_THEMES.general;
  const hay = cats.map((c) => `${c.slug} ${c.name}`).join(' ');
  for (const r of RULES) if (r.re.test(hay)) return STORE_THEMES[r.key];
  return STORE_THEMES.general;
}

/**
 * Resolve the theme a storefront actually renders with: an explicit
 * vendor choice wins; 'auto', legacy style names and anything unknown
 * fall back to the category's theme.
 */
export function resolveStoreTheme(
  style: string | null | undefined,
  cats: { slug: string; name: string }[] | null | undefined
): { theme: StoreThemeDef; isAuto: boolean } {
  if (style && style !== 'auto' && Object.prototype.hasOwnProperty.call(STORE_THEMES, style)) {
    return { theme: STORE_THEMES[style as StoreThemeKey], isAuto: false };
  }
  return { theme: themeForCategories(cats), isAuto: true };
}

export interface CatTheme {
  acc: string;
  acc2: string;
}

/** Back-compat accent pair (item pages, vendor dashboard shell). */
export function categoryTheme(cats: { slug: string; name: string }[] | null | undefined): CatTheme {
  const t = themeForCategories(cats);
  return { acc: t.acc, acc2: t.acc2 };
}
