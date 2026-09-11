/**
 * WhatsApp engine — BUILD_PLAN.md §8.  Pure, framework-free, and the most
 * thoroughly tested code in the repo: a mangled deep link is a lost sale that
 * nobody notices (plan.md 13.6).
 */
import { hmac, truncate } from "@/lib/util";

/* ------------------------------ E.164 ------------------------------ */
export type E164Result = { ok: true; e164: string } | { ok: false; reason: string };

/**
 * Accepts what vendors actually type: "0803 123 4567", "234-803-123-4567",
 * "+2348031234567", "00234 803 123 4567". Default country code 234 (NG) and
 * the local 0-prefixed national form both normalise to the same number.
 */
export function normalizeWhatsapp(input: string, defaultCC = "234"): E164Result {
  const raw = String(input ?? "").trim();
  if (!raw) return { ok: false, reason: "Enter a WhatsApp number, e.g. 08031234567." };
  // Letters inside a number are a typo, not formatting: mangling them into a valid-looking
  // number would silently send a buyer's enquiry to the wrong person.
  if (/[a-zA-Z]/.test(raw)) return { ok: false, reason: "A WhatsApp number cannot contain letters. Check for a typo." };
  if (!/^[+\d()\.\s-]+$/.test(raw)) return { ok: false, reason: "That number contains characters we cannot use." };
  const digits = raw.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  if (!/^\+?\d+$/.test(digits)) return { ok: false, reason: "That number contains characters we cannot use." };
  let d = digits.replace(/^\+/, "");
  if (d.startsWith("00")) d = d.slice(2);
  // "+234 (0)803..." - the bracketed trunk zero is dropped when dialling in international form
  if (d.length > defaultCC.length + 1 && d.startsWith(defaultCC) && d[defaultCC.length] === "0") {
    d = defaultCC + d.slice(defaultCC.length + 1);
  }
  if (/^0\d+$/.test(d)) d = defaultCC + d.slice(1);
  else if (d.length === 10 && !d.startsWith(defaultCC)) d = defaultCC + d;
  if (!/^\d{8,15}$/.test(d)) {
    return { ok: false, reason: `WhatsApp numbers are 8-15 digits including the country code. Got ${d.length}.` };
  }
  return { ok: true, e164: `+${d}` };
}

export const waHostDigits = (e164: string) => e164.replace(/[^\d]/g, "");

/* ------------------------------ templates (plan.md 62) ------------------------------ */
export const KNOWN_VARS = [
  "business_name", "vendor_name", "customer_name", "item_name", "item_url", "image_url",
  "price", "price_line", "quantity", "variant", "sku", "offer_line", "field_lines",
  "cart_lines", "total_line", "today", "business_url", "store_name",
] as const;
export type TemplateVar = (typeof KNOWN_VARS)[number];

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_:,-]*)\s*\}\}/g;

/** validate at admin save time: an unknown {{var}} must not reach a buyer (BUILD_PLAN 8.2) */
export function lintTemplate(body: string): string[] {
  const bad: string[] = [];
  for (const m of body.matchAll(VAR_RE)) {
    const name = m[1]!;
    if (name.startsWith("field:")) continue;      // dynamic custom-field reference
    if (!(KNOWN_VARS as readonly string[]).includes(name)) bad.push(name);
  }
  return [...new Set(bad)];
}

export const DEFAULT_TEMPLATES: Record<string, string> = {
  purchase_enquiry:
    "Hello {{business_name}}, I would like to order this.\n\nItem: {{item_name}}\n{{price_line}}\nQuantity: {{quantity}}\n{{variant}}\n{{sku}}\n{{offer_line}}\n{{field_lines}}\nProduct page: {{item_url}}\n\nPlease confirm availability and final price.",
  service_enquiry:
    "Hello {{business_name}},\n\nI would like to enquire about: {{item_name}}\n{{price_line}}\n{{field_lines}}\nDetails: {{item_url}}",
  course_registration:
    "Hello {{business_name}},\n\nI would like to register for {{item_name}}.\n{{price_line}}\n{{field_lines}}\nCourse page: {{item_url}}",
  booking_enquiry:
    "Hello {{business_name}},\n\nI would like to book: {{item_name}}\n{{field_lines}}\nService page: {{item_url}}",
  inspection_request:
    "Hello {{business_name}},\n\nI would like to schedule an inspection for {{item_name}}.\n{{price_line}}\n{{field_lines}}\nListing: {{item_url}}",
  general_enquiry: "Hello {{business_name}},\n\nI have a question about {{item_name}}: {{item_url}}",
  cart:
    "Hello {{business_name}},\n\nI would like to enquire about these items:\n\n{{cart_lines}}\n{{total_line}}\n\nPlease confirm availability and final price.\nStore: {{business_url}}",
};

export type MessageContext = {
  businessName: string;
  vendorName?: string | null;
  customerName?: string | null;
  itemName?: string | null;
  itemUrl?: string | null;
  imageUrl?: string | null;
  price?: string | null;
  currency?: string;
  quantity?: number;
  variant?: string | null;
  sku?: string | null;
  offerLine?: string | null;
  fieldLines?: string[];
  cartLines?: Array<{ name: string; qty: number; price?: string | null }>;
  totalLine?: string | null;
  businessUrl?: string | null;
};

const money = (v: string | null | undefined, currency = "NGN") => {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return (currency === "NGN" ? "\u20a6" : `${currency} `) + n.toLocaleString("en-NG", { maximumFractionDigits: 2 });
};

/**
 * Render a template. Unknown/empty variables collapse to nothing so an admin typo
 * never prints `{{typo}}` in front of a buyer; whole lines that become blank are
 * removed, so the message reads naturally whatever the data.
 */
export function renderTemplate(body: string, ctx: MessageContext): string {
  const today = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeZone: "Africa/Lagos" }).format(new Date());
  const cart = ctx.cartLines ?? [];
  const map: Record<string, string> = {
    business_name: ctx.businessName,
    store_name: ctx.businessName,
    vendor_name: ctx.vendorName ?? ctx.businessName,
    customer_name: ctx.customerName ?? "",
    item_name: ctx.itemName ?? "",
    item_url: ctx.itemUrl ?? "",
    image_url: ctx.imageUrl ?? "",
    business_url: ctx.businessUrl ?? "",
    price: money(ctx.price, ctx.currency) ?? "",
    price_line: money(ctx.price, ctx.currency) ? `Price: ${money(ctx.price, ctx.currency)}` : "",
    quantity: String(ctx.quantity ?? 1),
    variant: ctx.variant ? `Option: ${ctx.variant}` : "",
    sku: ctx.sku ? `SKU: ${ctx.sku}` : "",
    offer_line: ctx.offerLine ?? "",
    field_lines: (ctx.fieldLines ?? []).join("\n"),
    cart_lines: cart.map((l, i) => `${i + 1}. ${l.name} \u00d7 ${l.qty}${l.price ? ` (${l.price})` : ""}`).join("\n"),
    total_line: ctx.totalLine ? `Estimated total: ${ctx.totalLine}` : "",
    today,
  };
  const lines = body.split("\n");
  const rendered = lines
    .map((line) => line.replace(VAR_RE, (whole, name: string) => {
    if (name.startsWith("field:")) {
      const key = name.slice(6);
      return (ctx.fieldLines ?? []).find((l) => l.toLowerCase().startsWith(`${key.toLowerCase()}:`)) ?? "";
    }
      return map[name] ?? "";
    }))
    // A line that had content but rendered to nothing is dropped entirely, so a missing
    // price/variant never leaves "Price: " or a stray blank line in front of a buyer.
    .filter((out, i) => (out.trim() !== "" || lines[i]!.trim() === ""))
    .map((l) => l.replace(/[ \t]+$/g, "").replace(/^(Reference|Details|Product page|Course page|Service page|Listing|Item): *$/i, ""));
  return rendered
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ------------------------------ deep link ------------------------------ */
/** WhatsApp text limit is 4096 chars for web; ~900 keeps previews and iOS share sheets sane. */
export const MESSAGE_LIMIT = 900;

export type BuiltLink = { url: string; text: string; truncated: boolean; digits: string };

export function buildWaLink(numberE164: string, text: string): BuiltLink {
  const norm = normalizeWhatsapp(numberE164);
  if (!norm.ok) throw new Error(`buildWaLink: invalid number (${norm.reason})`);
  const digits = waHostDigits(norm.e164);
  let body = text.replace(/\r\n/g, "\n").trim();
  let truncated = false;
  if (body.length > MESSAGE_LIMIT) { body = truncate(body, MESSAGE_LIMIT); truncated = true; }
  // encodeURIComponent, NOT encodeURI: & = ? # must be escaped or wa.me truncates the message.
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
  return { url, text: body, truncated, digits };
}

export function signWaTarget(e164: string, text: string, secret: string) {
  const link = buildWaLink(e164, text);
  return { ...link, sig: hmac(secret, `${link.digits}|${link.text}`).slice(0, 32) };
}

/* ------------------------------ routing (plan.md 63, BUILD_PLAN 8.4) ------------------------------ */
export type RoutingNumber = { id: string; e164: string; label: string; isDefault: boolean; isActive: boolean };
export type RoutingRule = { matchType: "item" | "category" | "catalogue_type" | "offer" | "fallback"; matchRef: string | null; whatsappNumberId: string; priority: number };
export type RoutableItem = { id: string; categoryId?: string | null; catalogueTypeId?: string | null; whatsappNumberId?: string | null };

/**
 * item's own number -> highest-priority matching rule (category > type > fallback) ->
 * default number. Inactive numbers are skipped, never silently used (BUILD_PLAN 8.4).
 */
export function resolveNumber(item: RoutableItem, numbers: RoutingNumber[], rules: RoutingRule[]): RoutingNumber | null {
  const live = new Map(numbers.filter((n) => n.isActive).map((n) => [n.id, n]));
  if (item.whatsappNumberId && live.has(item.whatsappNumberId)) return live.get(item.whatsappNumberId)!;
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  const kindRank = { item: 0, category: 1, catalogue_type: 2, offer: 3, fallback: 4 } as const;
  for (const rule of sorted.sort((a, b) => kindRank[a.matchType] - kindRank[b.matchType] || a.priority - b.priority)) {
    if (!live.has(rule.whatsappNumberId)) continue;
    if (rule.matchType === "item" && rule.matchRef === item.id) return live.get(rule.whatsappNumberId)!;
    if (rule.matchType === "category" && rule.matchRef && rule.matchRef === item.categoryId) return live.get(rule.whatsappNumberId)!;
    if (rule.matchType === "catalogue_type" && rule.matchRef && rule.matchRef === item.catalogueTypeId) return live.get(rule.whatsappNumberId)!;
    if (rule.matchType === "fallback") return live.get(rule.whatsappNumberId)!;
  }
  return numbers.find((n) => n.isDefault && n.isActive) ?? [...live.values()][0] ?? null;
}

/** human summary for the dashboard "where do enquiries go?" panel */
export function describeRouting(item: RoutableItem, numbers: RoutingNumber[], rules: RoutingRule[]) {
  const n = resolveNumber(item, numbers, rules);
  return n ? `${n.label} \u00b7 ${n.e164}` : "No active WhatsApp number - add one to receive enquiries";
}
