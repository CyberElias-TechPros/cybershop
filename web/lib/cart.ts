/**
 * WhatsApp cart (plan §30) — client-side, per-business, guest-friendly.
 *
 * The cart holds nothing of value that the server must trust: it is pure UI
 * state (localStorage) and the single point of contact with the platform is
 * the inquiry POST, where every listing_id is re-validated server-side.
 *
 * Shape: { [businessId]: { items: { [listingId]: line }, ts } }
 * `active` tracks the last-touched business so the floating chip knows what
 * to show without polling.
 */

export interface CartLine {
  listing_id: number;
  name: string;
  price_kobo: number | null;
  price_display: string;
  image: string | null;
  qty: number;
}

export interface CartState {
  [businessId: number]: { items: Record<number, CartLine>; name: string; ts: number };
  active?: number;
}

const KEY = 'cs-cart-v1';
const MAX_LINES = 20;
const MAX_QTY = 99;

function load(): CartState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const j = JSON.parse(raw) as CartState;
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

function save(s: CartState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full/blocked — cart degrades to session-only */
  }
  window.dispatchEvent(new CustomEvent('cs-cart', { detail: s.active ?? null }));
}

export function getCart(businessId: number): CartLine[] {
  const s = load();
  const biz = s[businessId];
  if (!biz) return [];
  return Object.values(biz.items).sort((a, b) => a.listing_id - b.listing_id);
}

export function addLine(businessId: number, businessName: string, line: Omit<CartLine, 'qty'>): CartLine {
  const s = load();
  const biz = s[businessId] ?? (s[businessId] = { items: {}, name: businessName, ts: Date.now() });
  if (businessName) biz.name = businessName;
  const existing = biz.items[line.listing_id];
  const qty = Math.min(MAX_QTY, (existing?.qty ?? 0) + 1);
  const merged: CartLine = { ...line, qty };
  biz.items[line.listing_id] = merged;
  biz.ts = Date.now();
  s.active = businessId;
  save(s);
  return merged;
}

export function setQty(businessId: number, listingId: number, qty: number) {
  const s = load();
  const biz = s[businessId];
  if (!biz) return;
  const line = biz.items[listingId];
  if (!line) return;
  const q = Math.max(1, Math.min(MAX_QTY, qty));
  line.qty = q;
  biz.ts = Date.now();
  save(s);
}

export function removeLine(businessId: number, listingId: number) {
  const s = load();
  const biz = s[businessId];
  if (!biz) return;
  delete biz.items[listingId];
  if (Object.keys(biz.items).length === 0) delete s[businessId];
  if (s.active === businessId && !s[businessId]) delete s.active;
  save(s);
}

export function clearCart(businessId: number) {
  const s = load();
  delete s[businessId];
  if (s.active === businessId) delete s.active;
  save(s);
}

/** Known fixed prices only; negotiable items contribute 0 (labelled in the message). */
export function cartTotalKobo(businessId: number): number {
  return getCart(businessId).reduce((sum, l) => sum + (l.price_kobo ?? 0) * l.qty, 0);
}

export function cartCount(businessId: number): number {
  return getCart(businessId).reduce((n, l) => n + l.qty, 0);
}

export function activeBusinessId(): number | null {
  return load().active ?? null;
}
