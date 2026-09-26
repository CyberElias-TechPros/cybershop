export const STOREFRONT_STYLES = ['classic', 'editorial', 'minimal', 'bold'] as const;

export const SECTION_KEYS = ['hero', 'featured', 'offers', 'about', 'gallery', 'faq', 'location'] as const;

export interface Storefront {
  style: (typeof STOREFRONT_STYLES)[number];
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
  return { style: 'classic', accent: '', sections: { ...DEFAULT_SECTIONS }, faq: [], hours: null };
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
  if (STOREFRONT_STYLES.includes(o.style as never)) out.style = o.style as Storefront['style'];
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
