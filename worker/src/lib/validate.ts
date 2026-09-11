import { validationError } from './errors';

export function reqStr(v: unknown, opts: { min?: number; max?: number } = {}): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (opts.min !== undefined && s.length < opts.min) throw validationError('This field is required or too short.');
  if (opts.max !== undefined && s.length > opts.max) throw validationError('This field is too long.');
  return s;
}

export function optStr(v: unknown, max = 500): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw validationError('Invalid value.');
  const s = v.trim();
  if (s.length > max) throw validationError('This field is too long.');
  return s;
}

export function isEmail(v: unknown): boolean {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 190;
}

export function reqEmail(v: unknown): string {
  const s = reqStr(v, { min: 3, max: 190 });
  if (!isEmail(s)) throw validationError('Enter a valid email address.');
  return s.toLowerCase();
}

/** Phone: 10–15 digits, optional leading +. */
export function reqPhone(v: unknown): string {
  const s = reqStr(v, { min: 9, max: 20 });
  if (!/^\+?\d{10,15}$/.test(s)) throw validationError('Enter a valid phone number.');
  return s;
}

export function reqPassword(v: unknown): string {
  const s = reqStr(v, { min: 8, max: 200 });
  if (!/[a-zA-Z]/.test(s) || !/\d/.test(s)) throw validationError('Password must be at least 8 characters and include a letter and a number.');
  return s;
}

export function reqInt(v: unknown, opts: { min?: number; max?: number } = {}): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw validationError('Invalid number.');
  if (opts.min !== undefined && n < opts.min) throw validationError('Value is too small.');
  if (opts.max !== undefined && n > opts.max) throw validationError('Value is too large.');
  return n;
}

export function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Validate custom field values against a category field schema.
 * Returns a sanitized object. Unknown keys are dropped.
 */
export function validateCustomFields(schema: unknown, values: unknown): Record<string, unknown> {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return {};
  let fields: FieldDef[] = [];
  try {
    fields = JSON.parse(typeof schema === 'string' ? schema : '[]');
  } catch {
    return {};
  }
  if (!Array.isArray(fields)) return {};
  const out: Record<string, unknown> = {};
  const v = values as Record<string, unknown>;
  for (const f of fields) {
    if (!f || typeof f.key !== 'string' || !/^[a-z0-9_]{1,40}$/.test(f.key)) continue;
    const raw = v[f.key];
    if (raw === undefined || raw === null || raw === '') {
      if (f.required) throw validationError(`"${f.label || f.key}" is required.`);
      continue;
    }
    out[f.key] = coerce(f, raw);
  }
  return out;
}

interface FieldDef {
  key: string;
  label?: string;
  type?: string;
  required?: boolean;
  options?: string[] | string;
}

function coerce(f: FieldDef, raw: unknown): unknown {
  const t = f.type || 'text';
  switch (t) {
    case 'text':
    case 'phone':
    case 'email':
    case 'url':
    case 'date':
    case 'time':
      return reqStr(raw, { max: 300 });
    case 'long_text':
    case 'rich_text':
      return reqStr(raw, { max: 20000 });
    case 'number': {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw validationError(`"${f.label || f.key}" must be a number.`);
      return n;
    }
    case 'currency': {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) throw validationError(`"${f.label || f.key}" must be a valid amount.`);
      return Math.round(n * 100);
    }
    case 'boolean':
      return raw === true || raw === 'true' || raw === 1 || raw === '1';
    case 'select':
    case 'radio': {
      const s = String(raw);
      if (f.options) {
        const opts = Array.isArray(f.options) ? f.options : JSON.parse(f.options);
        if (!opts.includes(s)) throw validationError(`"${f.label || f.key}" must be one of the listed options.`);
      }
      return s.slice(0, 200);
    }
    case 'multi_select':
    case 'checkbox': {
      const arr = Array.isArray(raw) ? raw : String(raw).split(',').map((s) => s.trim()).filter(Boolean);
      if (!Array.isArray(arr) || arr.length > 50) throw validationError(`"${f.label || f.key}" is invalid.`);
      if (f.options) {
        const opts = Array.isArray(f.options) ? f.options : JSON.parse(f.options);
        for (const item of arr) if (!opts.includes(String(item))) throw validationError(`"${f.label || f.key}" contains an invalid option.`);
      }
      return arr.map((s) => String(s).slice(0, 200));
    }
    default:
      return String(raw).slice(0, 500);
  }
}
