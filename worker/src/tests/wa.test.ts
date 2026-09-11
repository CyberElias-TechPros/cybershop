import { describe, it, expect } from 'vitest';
import { renderTemplate, normalizeWaNumber, waLink } from '../lib/wa';
import { formatNaira } from '../lib/money';
import { slugify } from '../lib/util';
import { validateCustomFields } from '../lib/validate';

describe('WhatsApp message engine', () => {
  it('renders all known variables', () => {
    const out = renderTemplate('Hi {{business_name}}! {{item_name}} costs {{price}}. Qty {{quantity}}. {{item_url}}', {
      business_name: 'ABC Fashion',
      item_name: 'Red Dress',
      price: '₦45,000',
      quantity: '2',
      item_url: 'https://cybershop.ng/business/abc-fashion/products/red-dress',
    });
    expect(out).toBe('Hi ABC Fashion! Red Dress costs ₦45,000. Qty 2. https://cybershop.ng/business/abc-fashion/products/red-dress');
  });

  it('empties unknown variables instead of leaking tokens', () => {
    const out = renderTemplate('A {{nope}} B {{known}}', { known: 'x' });
    expect(out).toBe('A  B x');
  });

  it('normalizes Nigerian numbers with and without country code', () => {
    expect(normalizeWaNumber('0803 123 4567')).toBe('2348031234567');
    expect(normalizeWaNumber('+234 803 123 4567')).toBe('2348031234567');
    expect(normalizeWaNumber('2348031234567')).toBe('2348031234567');
  });

  it('rejects invalid numbers', () => {
    expect(() => normalizeWaNumber('123')).toThrow();
    expect(() => normalizeWaNumber('abcdefgh')).toThrow();
  });

  it('builds a correctly encoded wa.me link', () => {
    const url = waLink('2348031234567', 'Hello line1\nline2 ₦450,000');
    expect(url).toBe(`https://wa.me/2348031234567?text=${encodeURIComponent('Hello line1\nline2 ₦450,000')}`);
  });
});

describe('money formatting', () => {
  it('formats kobo to naira with separators', () => {
    expect(formatNaira(45000000)).toBe('₦450,000');
    expect(formatNaira(15000)).toBe('₦150');
    expect(formatNaira(0)).toBe('₦0');
    expect(formatNaira(null)).toBe('');
  });
});

describe('slugs', () => {
  it('slugifies names safely', () => {
    expect(slugify('ABC Fashion & More!')).toBe('abc-fashion-more');
    expect(slugify('  Cyber   Elias  ')).toBe('cyber-elias');
  });
});

describe('custom field validation (category schema engine)', () => {
  const schema = JSON.stringify([
    { key: 'duration', label: 'Duration', type: 'text', required: true },
    { key: 'skill_level', label: 'Skill level', type: 'select', required: false, options: ['Beginner', 'Advanced'] },
    { key: 'bedrooms', label: 'Bedrooms', type: 'number', required: false },
    { key: 'certification', label: 'Certificate', type: 'boolean', required: false },
    { key: 'sizes', label: 'Sizes', type: 'multi_select', required: false, options: ['S', 'M', 'L'] },
  ]);

  it('passes valid values through with coercion', () => {
    const out = validateCustomFields(schema, {
      duration: '12 weeks',
      skill_level: 'Beginner',
      bedrooms: '4',
      certification: true,
      sizes: ['S', 'M'],
    });
    expect(out).toEqual({ duration: '12 weeks', skill_level: 'Beginner', bedrooms: 4, certification: true, sizes: ['S', 'M'] });
  });

  it('rejects invalid option values', () => {
    expect(() => validateCustomFields(schema, { duration: 'x', skill_level: 'Guru' })).toThrow();
  });

  it('enforces required fields', () => {
    expect(() => validateCustomFields(schema, { skill_level: 'Beginner' })).toThrow(/Duration/);
  });

  it('drops unknown keys', () => {
    const out = validateCustomFields(schema, { duration: 'x', hacked_field: 'nope' });
    expect(out).toEqual({ duration: 'x' });
  });
});
