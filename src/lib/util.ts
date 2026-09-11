import { createHash, createHmac, randomBytes } from "node:crypto";

/* ---------------- ids ---------------- */
/** UUIDv7 (time-sortable) — keeps index locality sane for a high-insert table like analytics. */
export function uuidv7(): string {
  const ts = BigInt(Date.now());
  const b = randomBytes(16);
  b[0] = Number((ts >> 40n) & 0xffn);
  b[1] = Number((ts >> 32n) & 0xffn);
  b[2] = Number((ts >> 24n) & 0xffn);
  b[3] = Number((ts >> 16n) & 0xffn);
  b[4] = Number((ts >> 8n) & 0xffn);
  b[5] = Number(ts & 0xffn);
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0"));
  return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10, 16).join("")}`;
}

const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
/** short, URL-safe code for /w/:code (BUILD_PLAN 8.3) */
export function shortCode(len = 8): string {
  const bytes = randomBytes(len);
  return [...bytes].map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
}

export const sha256 = (input: string | Buffer) =>
  createHash("sha256").update(input).digest("hex");

export const hmac = (secret: string, input: string) =>
  createHmac("sha256", secret).update(input).digest("hex");

export const timingSafeEqual = (a: string, b: string) => {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return require("node:crypto").timingSafeEqual(ba, bb) as boolean;
};

/* ---------------- slugs (plan.md 13.4 clean URLs) ---------------- */
const RESERVED = new Set([
  "admin", "api", "dashboard", "account", "login", "signup", "business", "discover", "search",
  "settings", "static", "assets", "media", "w", "p", "sitemap.xml", "robots.txt", "onboarding",
]);

export function slugify(input: string, { max = 64 } = {}): string {
  const s = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return s;
}

export function isValidSlug(s: string): boolean {
  return s.length >= 3 && /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(s) && !RESERVED.has(s);
}

/** deterministic, collision-resistant unique slug suffix */
export function ensureUniqueSlug(base: string, taken: Set<string>): string {
  const root = slugify(base) || "item";
  if (!taken.has(root) && isValidSlug(root)) return root;
  for (let i = 2; i < 500; i++) {
    const cand = `${root}-${i}`;
    if (!taken.has(cand)) return cand;
  }
  return `${root}-${randomBytes(3).toString("hex")}`;
}

/* ---------------- money ---------------- */
/** Stored as numeric(14,2) strings; parsed for arithmetic, never as JS float math. */
export function formatMoney(value: string | number | null | undefined, currency = "NGN"): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "";
  const symbol = currency === "NGN" ? "\u20a6" : `${currency} `;
  return symbol + n.toLocaleString("en-NG", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
}

export function parseMoney(raw: string): string | null {
  const cleaned = raw.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(cleaned)) return null;
  return cleaned;
}

export function applyDiscount(price: string | null, percentOff?: string | null, amountOff?: string | null, override?: string | null) {
  if (override) return override;
  if (!price) return null;
  const p = Number(price);
  if (!Number.isFinite(p)) return null;
  if (percentOff) return ((p * (100 - Number(percentOff))) / 100).toFixed(2);
  if (amountOff) return Math.max(0, p - Number(amountOff)).toFixed(2);
  return null;
}

/* ---------------- results (typed action returns, BUILD_PLAN 9.1) ---------------- */
/** `AnyResult` is what mutations with a payload return; `Result` is the void form. */
export type AnyResult = Result<unknown>;
export type Result<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; fields?: Record<string, string> };

export const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
export const fail = (code: string, message: string, fields?: Record<string, string>): Result<never> =>
  ({ ok: false, code, message, fields });

/* ---------------- misc ---------------- */
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function truncate(s: string, max: number) {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1)).trimEnd()}\u2026`;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** allow-list sanitiser for richtext (BUILD_PLAN 10.3 XSS row) */
const ALLOWED = new Set(["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "h3", "h4", "blockquote", "a"]);
export function sanitizeHtml(input: string): string {
  let depth = 0;
  const stack: string[] = [];
  const out: string[] = [];
  const re = /<\/?([a-zA-Z0-9]+)([^>]*)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const text = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  while ((m = re.exec(input))) {
    out.push(text(input.slice(last, m.index)));
    last = m.index + m[0].length;
    const tag = m[1]!.toLowerCase();
    const closing = m[0].startsWith("</");
    if (!ALLOWED.has(tag)) continue;
    if (closing) {
      const i = stack.lastIndexOf(tag);
      if (i >= 0) { while (stack.length > i) out.push(`</${stack.pop()}>`); depth--; }
      continue;
    }
    if (tag === "a") {
      const href = /href\s*=\s*"?([^"\s>]+)"?/i.exec(m[2] ?? "")?.[1];
      if (!href || !/^(https?:)?\/\//i.test(href)) continue;   // no javascript:/data:
      out.push(`<a href="${href.replace(/"/g, "&quot;")}" rel="nofollow noopener" target="_blank">`);
      stack.push(tag); depth++;
      continue;
    }
    out.push(`<${tag}>`); stack.push(tag); depth++;
    if (depth > 40) break;
  }
  out.push(text(input.slice(last)));
  while (stack.length) out.push(`</${stack.pop()}>`);
  return out.join("").trim();
}
