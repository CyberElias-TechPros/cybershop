/**
 * Category theme morphing (design blueprint §5): each industry carries its
 * own accent duet. The Night Market base (deep green-black canvas, Fraunces,
 * gold) stays constant — only the accent layers recolor, so "Tech Academy"
 * reads as deep neon blue on a structural grid, "Bakery" as warm earth
 * tones, etc. Storefronts and the owning vendor's dashboard share the
 * accent, so the vendor recognises their own brand surface.
 *
 * Pure server-safe (no 'use client') — used to set CSS custom properties
 * inline on page roots.
 */

export interface CatTheme {
  /** primary accent */
  acc: string;
  /** secondary accent (gradients, glow) */
  acc2: string;
}

const MAP: { re: RegExp; t: CatTheme }[] = [
  { re: /(tech|academy|software|digital|coding|computer|it-?school|training)/i, t: { acc: '#4f8cff', acc2: '#8b5cf6' } },
  { re: /(food|bakery|restaurant|kitchen|cuisine|eat|cafe|bar-?ber)/i, t: { acc: '#e0a35c', acc2: '#c2703d' } },
  { re: /(fashion|beauty|hair|nail|style|apparel|makeup|spa)/i, t: { acc: '#e0709c', acc2: '#a05cd6' } },
  { re: /(real-?estate|property|home|land|building|construction)/i, t: { acc: '#2fbfa7', acc2: '#1f8fa3' } },
  { re: /(car|auto|vehicle|motor|driving)/i, t: { acc: '#d4af37', acc2: '#b8862f' } },
  { re: /(health|medical|pharma|clinic|gym|fitness)/i, t: { acc: '#37c6a0', acc2: '#2a9d8f' } },
];

const DEFAULT: CatTheme = { acc: '#0a9457', acc2: '#d4af37' };

export function categoryTheme(cats: { slug: string; name: string }[] | null | undefined): CatTheme {
  if (!cats || cats.length === 0) return DEFAULT;
  const hay = cats.map((c) => `${c.slug} ${c.name}`).join(' ');
  for (const m of MAP) if (m.re.test(hay)) return m.t;
  return DEFAULT;
}
