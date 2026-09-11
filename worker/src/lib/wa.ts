import { AppError, badRequest } from './errors';

export interface WaVars {
  business_name?: string;
  business_url?: string;
  item_name?: string;
  item_url?: string;
  price?: string;
  quantity?: string;
  customer_name?: string;
  [k: string]: string | undefined;
}

/** Replace {{var}} tokens. Unknown tokens become empty strings (never raw). */
export function renderTemplate(body: string, vars: WaVars): string {
  return body.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key: string) => {
    const v = vars[key.toLowerCase()];
    return v === undefined ? '' : String(v);
  });
}

export function normalizeWaNumber(input: string): string {
  const digits = (input || '').replace(/[^\d]/g, '');
  if (!/^\d{10,15}$/.test(digits)) {
    throw badRequest('Enter a valid WhatsApp number including country code, e.g. 2348031234567.');
  }
  // Nigerian numbers without country code (start with 0) → add 234
  let out = digits;
  if (out.startsWith('0') && out.length === 11) out = '234' + out.slice(1);
  return out;
}

export function waLink(number: string, message: string): string {
  const digits = number.replace(/[^\d]/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** The exact prefilled message for an item (or general business enquiry). */
export function buildMessage(templateBody: string, vars: WaVars): string {
  const rendered = renderTemplate(templateBody, vars);
  if (!rendered.trim()) throw new AppError(500, 'template_empty', 'Message template is empty.');
  // keep within a sane length for wa.me
  return rendered.slice(0, 3500);
}
