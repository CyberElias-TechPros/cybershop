import type { ReactElement } from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Share cards.
 *
 * This marketplace grows by vendors pasting a listing into WhatsApp groups, so
 * the link preview *is* the shop window. These are 1200×630 (the size every
 * scraper expects) with the photo, the price and the store name baked in — a
 * bare photo link gives a buyer nothing to judge.
 *
 * Kept as plain JSX for Satori: no CSS files, no CSS variables, no web fonts to
 * download. Inline styles only.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';
export const OG_FONT_FAMILY = 'Fraunces';

let cachedFont: ArrayBuffer | null = null;

/**
 * The face used on every share card.
 *
 * Loaded from the repo rather than fetched: Satori has no glyph for the naira
 * sign, and its fallback is to download a Google Font while the request is
 * open — a network dependency on the most important image we serve, and the
 * reason a price could render as an empty box. `app/fonts/OgFraunces-Bold.ttf`
 * is a 19 KB static subset of the app's own display face pinned to weight 800
 * and carrying ₦ (U+20A6), so a card renders offline and identically every
 * time. See app/fonts/README.md to regenerate it.
 */
export function ogFonts(): { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }[] {
  if (!cachedFont) {
    const file = path.join(process.cwd(), 'app', 'fonts', 'OgFraunces-Bold.ttf');
    const buf = readFileSync(file);
    cachedFont = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }
  return [{ name: OG_FONT_FAMILY, data: cachedFont, weight: 400, style: 'normal' }];
}

const INK = '#edf5f1';
const DIM = '#a3bcb2';
const BG = '#060b09';
const PANEL = '#0a120f';
const GREEN = '#2ce58e';
const GOLD = '#f2c879';

interface CardArgs {
  /** Small uppercased line above the headline — the store name or the segment. */
  kicker: string;
  /** The listing or store name. Truncated by the caller. */
  title: string;
  /** Big and green when present (a price); otherwise a plain sub-line. */
  price?: string | null;
  /** Secondary facts, joined with a middot. */
  meta?: string[];
  /** Right-hand photo. Must already be an absolute http(s) URL. */
  image?: string | null;
  /** "Verified vendor" / "Official CyberShop store". */
  badge?: string | null;
}

function Middots({ items }: { items: string[] }): ReactElement | null {
  const parts = items.filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <div style={{ display: 'flex', fontSize: 26, color: DIM, gap: 12, flexWrap: 'wrap' }}>
      {parts.map((p, i) => (
        <span key={i}>{i === 0 ? p : `· ${p}`}</span>
      ))}
    </div>
  );
}

export function OgCard({ kicker, title, price, meta, image, badge }: CardArgs): ReactElement {
  const titleSize = title.length > 52 ? 52 : title.length > 30 ? 62 : 72;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: `linear-gradient(135deg, ${BG} 0%, ${PANEL} 60%, #071410 100%)`,
        color: INK,
        fontFamily: OG_FONT_FAMILY,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: image ? 660 : 1200,
          padding: '64px 56px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 26, letterSpacing: 4, textTransform: 'uppercase', color: GREEN, fontWeight: 700 }}>
            {kicker}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 22,
              fontSize: titleSize,
              lineHeight: 1.1,
              fontWeight: 800,
              letterSpacing: -1,
            }}
          >
            {title}
          </div>
          {price ? (
            <div style={{ display: 'flex', marginTop: 26, fontSize: 54, fontWeight: 800, color: GREEN }}>{price}</div>
          ) : null}
          {meta?.length ? (
            <div style={{ display: 'flex', marginTop: 22 }}>
              <Middots items={meta} />
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {badge ? (
            <div
              style={{
                display: 'flex',
                alignSelf: 'flex-start',
                padding: '8px 18px',
                borderRadius: 999,
                fontSize: 24,
                fontWeight: 800,
                color: '#04150d',
                background: badge.startsWith('Official') ? GOLD : GREEN,
                marginBottom: 20,
              }}
            >
              {badge}
            </div>
          ) : null}
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 800, letterSpacing: 1 }}>
            Cyber<span style={{ color: GOLD }}>Shop</span>
          </div>
          <div style={{ display: 'flex', fontSize: 24, color: DIM, marginTop: 6 }}>
            Find it. Verify it. Talk to the seller on WhatsApp.
          </div>
        </div>
      </div>

      {image ? (
        <div style={{ display: 'flex', width: 540, height: '100%', position: 'relative' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} width={540} height={630} style={{ objectFit: 'cover', width: 540, height: 630 }} alt="" />
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 540,
              height: 630,
              background: 'linear-gradient(90deg, rgba(6,11,9,0.95) 0%, rgba(6,11,9,0) 22%)',
            }}
          />
        </div>
      ) : (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 300,
            height: 300,
            background: `radial-gradient(circle at 100% 0%, rgba(44,229,142,0.18) 0%, rgba(6,11,9,0) 70%)`,
          }}
        />
      )}
    </div>
  );
}
