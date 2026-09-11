/**
 * Catalogue engine — BUILD_PLAN.md §6.
 *
 * This registry is the single source of truth for what a field can do. The vendor
 * form, server-side validation, CSV import/export, the WhatsApp message line, the
 * EAV projection used for filtering, and the admin field builder's "what can this
 * field do" panel are ALL driven from here (plan.md 24 + 60). Adding a field type
 * is one entry in this file.
 */
import { z } from "zod";
import { inputKindFor, type InputKind } from "@/core/field-inputs";
import type { fieldDefinitions } from "@/db/schema";

export type FieldDef = {
  id: string;
  key: string;
  label: string;
  type: string;
  helpText: string | null;
  isRequired: boolean;
  isPublic: boolean;
  isFilterable: boolean;
  isSearchable: boolean;
  placeholder: string | null;
  config: Record<string, unknown>;
  validation: Record<string, unknown>;
  options?: FieldOption[];
  /** UI hints supplied by the caller: collapse into "More options", and a seed value */
  isAdvancedDefault?: boolean;
  defaultValue?: unknown;
};

export type FieldOption = { value: string; label: string };

export type FieldType =
  | "text" | "textarea" | "richtext" | "number" | "currency" | "boolean"
  | "date" | "time" | "datetime" | "select" | "multiselect" | "radio"
  | "checkbox" | "url" | "email" | "phone" | "image" | "video" | "file"
  | "location" | "duration" | "dims";

type V = Record<string, unknown>;

export interface FieldAdapter<T = unknown> {
  type: FieldType;
  label: string;
  /** form control hint consumed by ui/field-inputs (must equal inputKindFor(type)) */
  input: "text" | "textarea" | "richtext" | "number" | "money" | "switch" | "date" | "time" | "datetime" | "select" | "multiselect" | "radio" | "checkboxes" | "url" | "email" | "tel" | "media" | "video" | "file" | "geo" | "duration" | "dims";
  acceptsOptions: boolean;
  /** -> EAV projection columns */
  filterable: boolean;
  searchable: boolean;
  parse(raw: unknown, def: FieldDef): T | null;
  zod(def: FieldDef): z.ZodTypeAny;
  /** stable scalar used for equality filters */
  toFilterValue(v: T): { text?: string; num?: number; json?: unknown } | null;
  /** plain text for the FTS haystack */
  toText(v: T, def: FieldDef): string;
  /** one line in the composed WhatsApp message */
  toMessageLine(v: T, def: FieldDef): string | null;
  /** structured-data hint for JSON-LD (plan.md 45) */
  schemaType?: string;
  emptyValue: T;
}

const num = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") { const n = Number(v.replace(/[, ]/g, "")); return Number.isFinite(n) ? n : null; }
  return null;
};

/**
 * Vendors type "1,250.50", "₦1 250", " 45 ". Accept a cleaned string or a real number,
 * then bound it with .refine so the helper stays chainable for any schema shape.
 */
type NumOpts = { integer?: boolean; min?: number; max?: number; nonNegative?: boolean };
const numericInput = (label: string, o: NumOpts = {}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let s: any = z
    .union([z.number(), z.string().regex(/^[\s\d,.\u20a6$]*\.?\d*[\s]*$/, `${label} must be a number`)])
    .transform((v: unknown) => (typeof v === "string" ? Number(v.replace(/[^\d.\-]/g, "")) : v))
    .refine((v: unknown) => typeof v === "number" && Number.isFinite(v), `${label} must be a number`);
  if (o.integer) s = s.refine((v: number) => Number.isInteger(v), `${label} must be a whole number`);
  if (o.nonNegative) s = s.refine((v: number) => v >= 0, `${label} cannot be negative`);
  if (o.min !== undefined) s = s.refine((v: number) => v >= o.min!, `${label} must be at least ${o.min}`);
  if (o.max !== undefined) s = s.refine((v: number) => v <= o.max!, `${label} must be at most ${o.max}`);
  return s;
};
const cfg = <K extends keyof V>(def: FieldDef, key: K, fallback: unknown) =>
  ((def.config as V)?.[key as string] ?? fallback) as V[K];
const val = (def: FieldDef, key: string, fallback: unknown) => (def.validation as V)?.[key] ?? fallback;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));

/** shared validator for string-ish types */
function stringSchema(def: FieldDef, { max = 500, pattern }: { max?: number; pattern?: string } = {}) {
  let s = z.string().trim().max(max, `${def.label} is too long (max ${max} characters)`);
  if (def.isRequired) s = s.min(1, `${def.label} is required`) as typeof s;
  const p = val(def, "pattern", undefined) as string | undefined ?? pattern;
  if (p) s = s.regex(new RegExp(p), `${def.label} format is not accepted`) as typeof s;
  return s;
}
const boundChecks = (def: FieldDef) => {
  const min = val(def, "min", undefined), max = val(def, "max", undefined);
  return { min: typeof min === "number" ? min : undefined, max: typeof max === "number" ? max : undefined };
};

const optionValues = (def: FieldDef) => (def.options ?? []).filter((o) => o?.value).map((o) => o.value);

export const adapters: Record<FieldType, FieldAdapter<unknown>> = {
  text: {
    type: "text", label: "Short text", input: "text", acceptsOptions: false, filterable: true, searchable: true,
    emptyValue: "",
    parse: (v) => str(v),
    zod: (def) => stringSchema(def, { max: Number(val(def, "maxLength", 300)) }),
    toFilterValue: (v) => (v ? { text: String(v), json: String(v) } : null),
    toText: (v, def) => str(v),
    toMessageLine: (v, def) => (str(v) ? `${def.label}: ${str(v)}` : null),
    schemaType: "text",
  },
  textarea: {
    type: "textarea", label: "Long text", input: "textarea", acceptsOptions: false, filterable: false, searchable: true,
    emptyValue: "",
    parse: (v) => str(v),
    zod: (def) => stringSchema(def, { max: Number(val(def, "maxLength", 4000)) }),
    toFilterValue: () => null,
    toText: (v, def) => str(v),
    toMessageLine: (v, def) => (str(v) ? `${def.label}: ${truncateOneLine(str(v), 200)}` : null),
  },
  richtext: {
    type: "richtext", label: "Rich text", input: "richtext", acceptsOptions: false, filterable: false, searchable: true,
    emptyValue: "",
    parse: (v) => str(v),
    zod: (def) => stringSchema(def, { max: 20000 }),
    toFilterValue: () => null,
    // sanitised + flattened for search/OG by the caller; here keep text for the haystack
    toText: (v, def) => str(v).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    toMessageLine: () => null,
  },
  number: {
    type: "number", label: "Number", input: "number", acceptsOptions: false, filterable: true, searchable: false,
    emptyValue: null,
    parse: (v) => num(v),
    zod: (def) => {
      const { min, max } = boundChecks(def);
      const s = numericInput(def.label, { integer: val(def, "integer", false) === true, min, max });
      return def.isRequired ? s : z.union([s, z.literal(""), z.null()]).transform((x) => (x === "" || x === null ? null : x));
    },
    toFilterValue: (v) => (v === null || v === undefined ? null : { num: Number(v) }),
    toText: (v, def) => (v === null ? "" : String(v)),
    toMessageLine: (v, def) => (v !== null && v !== undefined && v !== "" ? `${def.label}: ${v}${cfg(def, "unit", "")}` : null),
  },
  currency: {
    type: "currency", label: "Money", input: "money", acceptsOptions: false, filterable: true, searchable: false,
    emptyValue: null,
    parse: (v) => num(v),
    zod: (def) => {
      const { min } = boundChecks(def);
      const s = numericInput(def.label, { nonNegative: true, min });
      return def.isRequired ? s : z.union([s, z.literal(""), z.null()]).transform((x) => (x === "" || x === null ? null : x));
    },
    toFilterValue: (v) => (v === null || v === undefined ? null : { num: Number(v) }),
    toText: (v, def) => (v === null ? "" : String(v)),
    toMessageLine: (v, def) => (v !== null && v !== undefined ? `${def.label}: ${formatNaira(Number(v))}` : null),
    schemaType: "Price",
  },
  boolean: {
    type: "boolean", label: "Yes / No", input: "switch", acceptsOptions: false, filterable: true, searchable: false,
    emptyValue: false,
    parse: (v) => v === true || v === "true" || v === 1 || v === "1",
    zod: (def) => z.union([z.boolean(), z.enum(["true", "false"]).transform((x) => x === "true")]).optional().default(false),
    toFilterValue: (v) => ({ json: Boolean(v) }),
    toText: (v, def) => (v ? "yes" : "no"),
    toMessageLine: (v, def) => (v ? `${def.label}: Yes` : null),
  },
  date: {
    type: "date", label: "Date", input: "date", acceptsOptions: false, filterable: true, searchable: false,
    emptyValue: "",
    parse: (v) => (ISO_DATE.test(str(v)) ? str(v) : ""),
    zod: (def) => {
      let s = z.string().regex(ISO_DATE, `${def.label} must be a valid date`);
      const before = val(def, "before", undefined) as string | undefined;
      const after = val(def, "after", undefined) as string | undefined;
      if (before) s = s.refine((x) => x <= before, `${def.label} must be on or before ${before}`) as typeof s;
      if (after) s = s.refine((x) => x >= after, `${def.label} must be on or after ${after}`) as typeof s;
      return def.isRequired ? s : z.union([s, z.literal("")]);
    },
    toFilterValue: (v) => (v ? { text: String(v), num: Date.parse(String(v)) / 86400000 } : null),
    toText: (v, def) => str(v),
    toMessageLine: (v, def) => (str(v) ? `${def.label}: ${formatDate(str(v))}` : null),
    schemaType: "Date",
  },
  time: {
    type: "time", label: "Time", input: "time", acceptsOptions: false, filterable: false, searchable: false,
    emptyValue: "", parse: (v) => (/\d{1,2}:\d{2}/.test(str(v)) ? str(v) : ""),
    zod: (def) => (def.isRequired ? z.string().regex(/\d{1,2}:\d{2}/) : z.union([z.string().regex(/\d{1,2}:\d{2}/), z.literal("")])),
    toFilterValue: () => null, toText: (v, def) => str(v),
    toMessageLine: (v, def) => (str(v) ? `${def.label}: ${str(v)}` : null),
  },
  datetime: {
    type: "datetime", label: "Date & time", input: "datetime", acceptsOptions: false, filterable: true, searchable: false,
    emptyValue: "", parse: (v) => (Number.isFinite(Date.parse(str(v))) ? str(v) : ""),
    zod: (def) => (def.isRequired ? z.string().refine((x) => Number.isFinite(Date.parse(x))) : z.union([z.string().refine((x) => !x || Number.isFinite(Date.parse(x))), z.literal("")])),
    toFilterValue: (v) => (v ? { text: String(v), num: Date.parse(String(v)) / 86400000 } : null),
    toText: (v, def) => str(v),
    toMessageLine: (v, def) => (str(v) ? `${def.label}: ${formatDate(str(v))}` : null),
  },
  select: {
    type: "select", label: "Single choice", input: "select", acceptsOptions: true, filterable: true, searchable: true,
    emptyValue: "", parse: (v) => str(v),
    zod: (def) => {
      const opts = optionValues(def);
      const s = opts.length
        ? z.string().refine((x) => opts.includes(x), `${def.label}: choose one of the listed options`)
        : z.string();
      return def.isRequired ? s.refine((x) => x !== "", `${def.label} is required`) : s.refine((x) => x === "" || opts.includes(x), `${def.label}: choose one of the listed options`);
    },
    toFilterValue: (v) => (v ? { text: String(v), json: String(v) } : null),
    toText: (v, def) => optionLabel(def, str(v)),
    toMessageLine: (v, def) => (str(v) ? `${def.label}: ${optionLabel(def, str(v))}` : null),
  },
  multiselect: {
    type: "multiselect", label: "Multiple choice", input: "multiselect", acceptsOptions: true, filterable: true, searchable: true,
    emptyValue: [] as string[],
    parse: (v) => toArray(v),
    zod: (def) => {
      const opts = optionValues(def);
      const maxN = Number(val(def, "max", 99));
      const base = z.array(z.string())
        .refine((xs) => !opts.length || xs.every((x) => opts.includes(x)), `${def.label}: unlisted option`)
        .refine((xs) => xs.length <= maxN, `${def.label}: pick at most ${maxN}`);
      return def.isRequired ? base.refine((xs) => xs.length >= 1, `${def.label}: pick at least one`) : base;
    },
    toFilterValue: (v) => (toArray(v).length ? { json: toArray(v).sort() } : null),
    toText: (v, def) => toArray(v).map((x) => optionLabel(def, x)).join(", "),
    toMessageLine: (v, def) => { const t = toArray(v).map((x) => optionLabel(def, x)).join(", "); return t ? `${def.label}: ${t}` : null; },
  },
  radio: { type: "radio", label: "Radio", input: "radio", acceptsOptions: true, filterable: true, searchable: true,
    emptyValue: "", parse: (v) => str(v), zod: (def) => adapters.select.zod(def),
    toFilterValue: (v) => (v ? { json: String(v) } : null), toText: (v, def) => optionLabel(def, str(v)),
    toMessageLine: (v, def) => (str(v) ? `${def.label}: ${optionLabel(def, str(v))}` : null) },
  checkbox: { type: "checkbox", label: "Checkboxes", input: "checkboxes", acceptsOptions: true, filterable: true, searchable: true,
    emptyValue: [] as string[], parse: (v) => toArray(v), zod: (def) => adapters.multiselect.zod(def),
    toFilterValue: (v) => (toArray(v).length ? { json: toArray(v).sort() } : null),
    toText: (v, def) => toArray(v).map((x) => optionLabel(def, x)).join(", "),
    toMessageLine: (v, def) => { const t = toArray(v).map((x) => optionLabel(def, x)).join(", "); return t ? `${def.label}: ${t}` : null; } },
  url: { type: "url", label: "Link", input: "url", acceptsOptions: false, filterable: false, searchable: false,
    emptyValue: "", parse: (v) => str(v),
    // .url() alone accepts javascript:/data: - only http(s) may reach a buyer's browser
    zod: (def) => {
      const u = z.string().url(`${def.label} must be a full URL starting with https://`)
        .refine((x) => /^https?:\/\//i.test(x), `${def.label} must start with http:// or https://`);
      return def.isRequired ? u : z.union([u, z.literal("")]);
    },
    toFilterValue: () => null, toText: (v, def) => str(v),
    toMessageLine: (v, def) => (str(v) ? `${def.label}: ${str(v)}` : null) },
  email: { type: "email", label: "Email", input: "email", acceptsOptions: false, filterable: false, searchable: false,
    emptyValue: "", parse: (v) => str(v).toLowerCase(),
    zod: (def) => { const e = z.string().email(`${def.label} is not a valid email`); return def.isRequired ? e : z.union([e, z.literal("")]); },
    toFilterValue: () => null, toText: (v, def) => str(v),
    toMessageLine: (v, def) => (str(v) ? `${def.label}: ${str(v)}` : null) },
  phone: { type: "phone", label: "Phone", input: "tel", acceptsOptions: false, filterable: false, searchable: false,
    emptyValue: "", parse: (v) => str(v),
    zod: (def) => { const p = z.string().regex(/^\+?[\d\s-]{7,20}$/, `${def.label} must be a phone number`); return def.isRequired ? p : z.union([p, z.literal("")]); },
    toFilterValue: () => null, toText: (v, def) => str(v),
    toMessageLine: (v, def) => (str(v) ? `${def.label}: ${str(v)}` : null) },
  image: { type: "image", label: "Image", input: "media", acceptsOptions: false, filterable: false, searchable: false,
    emptyValue: [] as string[], parse: (v) => toArray(v),
    zod: (def) => z.array(z.string().uuid()).max(Number(val(def, "max", 10))),
    toFilterValue: () => null, toText: (_v, _def) => "", toMessageLine: () => null, schemaType: "ImageObject" },
  video: { type: "video", label: "Video", input: "video", acceptsOptions: false, filterable: false, searchable: false,
    emptyValue: null as string | null, parse: (v) => (str(v) ? str(v) : null),
    zod: (def) => (def.isRequired ? z.string().uuid() : z.union([z.string().uuid(), z.literal(""), z.null()])),
    toFilterValue: () => null, toText: (_v, _def) => "", toMessageLine: () => null },
  file: { type: "file", label: "Document", input: "file", acceptsOptions: false, filterable: false, searchable: false,
    emptyValue: [] as string[], parse: (v) => toArray(v),
    zod: (def) => z.array(z.string().uuid()).max(Number(val(def, "max", 5))),
    toFilterValue: () => null, toText: (_v, _def) => "", toMessageLine: (v, def) => (toArray(v).length ? `${def.label}: ${toArray(v).length} file(s) attached on the page` : null) },
  location: { type: "location", label: "Location", input: "geo", acceptsOptions: false, filterable: true, searchable: true,
    emptyValue: { label: "", lat: null, lng: null } as Geo,
    parse: (v) => normGeo(v) as unknown as Record<string, unknown>,
    zod: (def) => z.object({ label: z.string().trim().max(200), lat: z.number().min(-90).max(90).nullable().optional(), lng: z.number().min(-180).max(180).nullable().optional() }),
    toFilterValue: (v) => ((v as Geo)?.label ? { text: String((v as Geo).label), json: v } : null),
    toText: (v, def) => str((v as Geo)?.label),
    toMessageLine: (v, def) => ((v as Geo)?.label ? `${def.label}: ${(v as Geo).label}` : null),
    schemaType: "Place" },
  duration: { type: "duration", label: "Duration", input: "duration", acceptsOptions: false, filterable: true, searchable: false,
    emptyValue: null as number | null, parse: (v) => num(v),
    zod: (def) => { const n = numericInput(def.label, { integer: true, nonNegative: true }); return def.isRequired ? n : z.union([n, z.literal(""), z.null()]).transform((x) => (x === "" || x === null ? null : x)); },
    toFilterValue: (v) => (v === null ? null : { num: Number(v) }),
    toText: (v, def) => (v === null ? "" : `${v} ${cfg(def, "unit", "weeks")}`),
    toMessageLine: (v, def) => (v !== null && v !== undefined ? `${def.label}: ${v} ${cfg(def, "unit", "weeks")}` : null) },
  dims: { type: "dims", label: "Dimensions", input: "dims", acceptsOptions: false, filterable: false, searchable: false,
    emptyValue: { l: null, w: null, h: null } as Dims, parse: (v) => (typeof v === "object" && v ? (v as Dims) : { l: null, w: null, h: null }),
    zod: (def) => z.object({ l: z.coerce.number().nonnegative().nullable(), w: z.coerce.number().nonnegative().nullable(), h: z.coerce.number().nonnegative().nullable() }),
    toFilterValue: () => null,
    toText: (v, def) => dimsText(v as Dims),
    toMessageLine: (v, def) => (dimsText(v as Dims) ? `${def.label}: ${dimsText(v as Dims)}` : null) },
};

/* ---------------- helpers ---------------- */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
type Geo = { label: string; lat: number | null; lng: number | null };
type Dims = { l: number | null; w: number | null; h: number | null };

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(str).filter(Boolean);
  if (typeof v === "string" && v.trim()) return v.split(",").map((x) => x.trim()).filter(Boolean);
  return [];
}
function optionLabel(def: FieldDef, value: string) {
  return (def.options ?? []).find((o) => o.value === value)?.label ?? value;
}
function normGeo(v: unknown): Geo {
  if (typeof v === "string") return { label: v, lat: null, lng: null };
  if (v && typeof v === "object") {
    const o = v as V;
    return { label: str(o.label ?? o.address ?? ""), lat: num(o.lat), lng: num(o.lng) };
  }
  return { label: "", lat: null, lng: null };
}
function dimsText(v: Dims) {
  if (!v) return "";
  const parts = [v.l, v.w, v.h].map((x) => (x === null || x === undefined ? "" : String(x)));
  return parts.some(Boolean) ? `${parts.map((p) => p || "?").join(" \u00d7 ")} cm` : "";
}
function formatNaira(n: number) {
  return "\u20a6" + n.toLocaleString("en-NG", { maximumFractionDigits: 2 });
}
function formatDate(iso: string) {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : iso;
}
function truncateOneLine(s: string, n: number) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}\u2026` : t;
}

for (const a of Object.values(adapters)) {
  if (a.input !== inputKindFor(a.type)) {
    throw new Error(`field registry drift: ${a.type} declares input "${a.input}" but INPUT_KIND says "${inputKindFor(a.type)}"`);
  }
}

export const FIELD_TYPES = Object.values(adapters).map((a) => ({ type: a.type, label: a.label, input: a.input, acceptsOptions: a.acceptsOptions, filterable: a.filterable, searchable: a.searchable }));

export function adapterFor(type: string): FieldAdapter {
  const a = adapters[type as FieldType];
  if (!a) throw new Error(`unknown field type: ${type}`);   // unknown type = programmer error, loud
  return a;
}

export type ValidatedValues = Record<string, { value: unknown; def: FieldDef }>;

/**
 * Validate a payload against a field schema.
 * Unknown keys are REJECTED, not ignored (BUILD_PLAN 6.2) — otherwise the EAV bag becomes
 * a side-channel for `is_featured`/`price`, which the server owns (invariant I2).
 */
export function validateValues(defs: FieldDef[], payload: Record<string, unknown>) {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const values: ValidatedValues = {};
  const errors: Record<string, string> = {};

  for (const [key, raw] of Object.entries(payload ?? {})) {
    const def = byKey.get(key);
    if (!def) { errors[key] = "This field is not part of the catalogue template."; continue; }
    const adapter = adapterFor(def.type);
    const parsed = adapter.zod(def).safeParse(raw);
    if (!parsed.success) {
      errors[key] = parsed.error.issues[0]?.message ?? `${def.label} is invalid`;
      continue;
    }
    const v = parsed.data === undefined ? null : parsed.data;
    const isEmpty = v === null || v === "" || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && v && "label" in (v as Geo) && !(v as Geo).label);
    if (def.isRequired && isEmpty) { errors[key] = `${def.label} is required`; continue; }
    values[key] = { value: adapter.parse(v, def), def };
  }
  for (const def of defs) {
    if (def.isRequired && !(def.key in values) && !errors[def.key]) errors[def.key] = `${def.label} is required`;
  }
  return { values, errors: Object.keys(errors).length ? errors : null };
}

/** Build the projections stored alongside the raw JSON value. */
export function projectValues(defs: FieldDef[], values: ValidatedValues) {
  const out: Array<{ fieldDefinitionId: string; key: string; value: unknown; valueText: string | null; valueNum: string | null; valueJson: unknown }> = [];
  for (const def of defs) {
    const entry = values[def.key];
    if (!entry) continue;
    const adapter = adapterFor(def.type);
    const f = adapter.toFilterValue(entry.value) ?? {};
    out.push({
      fieldDefinitionId: def.id,
      key: def.key,
      value: entry.value,
      // filters use value_json/value_num; value_text is the *human* text that feeds search,
      // so "L" is findable, not the internal option value "l".
      valueText: adapter.toText(entry.value, def) || f.text || null,
      valueNum: f.num === undefined ? null : String(f.num),
      valueJson: f.json ?? null,
    });
  }
  return out;
}

/** The WhatsApp message lines contributed by custom fields (plan.md 24 -> plan.md 62). */
export function messageLines(defs: FieldDef[], values: ValidatedValues): string[] {
  const lines: string[] = [];
  for (const def of defs) {
    if (!def.isPublic) continue;
    const entry = values[def.key];
    if (!entry) continue;
    const line = adapterFor(def.type).toMessageLine(entry.value, def);
    if (line) lines.push(line);
  }
  return lines;
}

export function searchableText(defs: FieldDef[], values: ValidatedValues): string {
  return defs.map((d) => (values[d.key] ? adapterFor(d.type).toText(values[d.key].value, d) : "")).filter(Boolean).join(" \u00b7 ");
}

/** Convert filter params (discovery UI) into { fieldDefinitionId, op, value } joins. */
export function buildFilters(defs: FieldDef[], params: Record<string, string | undefined>) {
  const out: Array<{ fieldDefinitionId: string; mode: "eq" | "num" | "contains"; text?: string; num?: { gte?: number; lte?: number }; json?: unknown; label: string }> = [];
  for (const def of defs) {
    if (!def.isFilterable) continue;
    const raw = params[def.key];
    if (!raw) continue;
    const adapter = adapterFor(def.type);
    if (adapter.toFilterValue(raw)?.num !== undefined && (def.type === "number" || def.type === "currency" || def.type === "duration")) {
      const [lo, hi] = raw.split(":");
      const gte = num(lo), lte = num(hi);
      if (gte === null && lte === null) continue;
      out.push({ fieldDefinitionId: def.id, mode: "num", num: { ...(gte !== null ? { gte } : {}), ...(lte !== null ? { lte } : {}) }, label: def.label });
      continue;
    }
    const f = adapter.toFilterValue(raw);
    if (!f) continue;
    out.push({ fieldDefinitionId: def.id, mode: "eq", ...(f.json !== undefined ? { json: f.json } : {}), ...(f.text ? { text: f.text } : {}), label: def.label });
  }
  return out;
}
