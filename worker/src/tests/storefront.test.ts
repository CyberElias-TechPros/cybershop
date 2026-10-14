import { describe, it, expect } from 'vitest';
import { parseStorefront, STORE_THEMES } from '../lib/storefront';

describe('store themes (parseStorefront)', () => {
  it('defaults to auto (follow the category) with no settings', () => {
    expect(parseStorefront(null).style).toBe('auto');
    expect(parseStorefront(undefined).style).toBe('auto');
    expect(parseStorefront('not json').style).toBe('auto');
    expect(parseStorefront('{}').style).toBe('auto');
  });

  it('accepts every trade theme key', () => {
    for (const key of STORE_THEMES) {
      expect(parseStorefront(JSON.stringify({ style: key })).style).toBe(key);
    }
    expect(parseStorefront(JSON.stringify({ style: 'boutique' })).style).toBe('boutique');
    expect(parseStorefront(JSON.stringify({ style: 'kitchen' })).style).toBe('kitchen');
  });

  it('reads the newer theme key and lets it win over legacy style', () => {
    expect(parseStorefront(JSON.stringify({ theme: 'academy' })).style).toBe('academy');
    expect(parseStorefront(JSON.stringify({ theme: 'property', style: 'gadget' })).style).toBe('property');
  });

  it('maps the old abstract styles to auto — no store breaks', () => {
    for (const legacy of ['classic', 'editorial', 'minimal', 'bold']) {
      expect(parseStorefront(JSON.stringify({ style: legacy })).style).toBe('auto');
    }
  });

  it('rejects unknown or hostile values back to auto', () => {
    expect(parseStorefront(JSON.stringify({ style: 'neon-rave' })).style).toBe('auto');
    expect(parseStorefront(JSON.stringify({ style: '"><script>alert(1)</script>' })).style).toBe('auto');
    expect(parseStorefront(JSON.stringify({ style: 42 })).style).toBe('auto');
  });

  it('keeps the rest of the storefront intact alongside the theme', () => {
    const sf = parseStorefront(JSON.stringify({
      style: 'kitchen', hours: 'Mon–Sat 9–6',
      sections: { about: false, faq: true },
      faq: [{ q: 'Do you deliver?', a: 'Yes, we agree the fee on WhatsApp.' }],
    }));
    expect(sf.style).toBe('kitchen');
    expect(sf.hours).toBe('Mon–Sat 9–6');
    expect(sf.sections.about).toBe(false);
    expect(sf.sections.faq).toBe(true);
    expect(sf.faq[0]?.q).toBe('Do you deliver?');
  });
});
