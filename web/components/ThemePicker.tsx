'use client';

import type { CSSProperties } from 'react';
import { STORE_THEME_LIST, STORE_THEMES, type StoreThemeDef } from '@/lib/theme';

/**
 * Visual store-theme picker. Themes are named after the trade (Boutique,
 * Kitchen, Academy…) because sellers and buyers both recognise those —
 * the old abstract style dropdown (classic/editorial/minimal/bold) did
 * not even have CSS behind it. 'auto' follows the store's category and
 * is the default; every palette is a curated, contrast-checked preset,
 * so there is no free-form colour input to break a store with.
 */
export default function ThemePicker({
  value,
  autoTheme,
  onChange,
}: {
  /** Current stored style value ('auto' or a theme key; legacy names read as 'auto'). */
  value: string;
  /** The theme 'auto' currently resolves to, for the preview label. */
  autoTheme: StoreThemeDef;
  onChange: (key: string) => void;
}) {
  const active = value && value !== 'auto' && Object.prototype.hasOwnProperty.call(STORE_THEMES, value) ? value : 'auto';

  const card = (key: string, def: StoreThemeDef | null) => {
    const isActive = active === key;
    return (
      <button
        key={key}
        type="button"
        className={`theme-card${isActive ? ' is-active' : ''}`}
        style={{ ['--tc-acc' as string]: (def ?? autoTheme).acc } as CSSProperties}
        aria-pressed={isActive}
        onClick={() => onChange(key)}
      >
        <span className="theme-swatches" aria-hidden="true">
          <i style={{ background: (def ?? autoTheme).acc }} />
          <i style={{ background: (def ?? autoTheme).acc2 }} />
        </span>
        <span className="theme-name">
          {key === 'auto' ? `Auto — ${autoTheme.name}` : `${def!.icon} ${def!.name}`}
        </span>
        <span className="theme-for">
          {key === 'auto' ? `Follows your category (${autoTheme.for.toLowerCase()}). Recommended.` : def!.for}
        </span>
      </button>
    );
  };

  return (
    <div>
      <div className="theme-grid" role="group" aria-label="Store theme">
        {card('auto', null)}
        {STORE_THEME_LIST.map((def) => card(def.key, def))}
      </div>
      <p className="theme-auto-note">
        Your theme changes your storefront&rsquo;s colours, hero and catalogue heading
        (for example, a Kitchen store calls its catalogue &ldquo;The Menu&rdquo;). Your WhatsApp
        button, badges and the CyberShop header stay the same on every store, so buyers
        always recognise how to reach you safely.
      </p>
    </div>
  );
}
