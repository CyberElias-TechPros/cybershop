/**
 * Client-safe mapping of field type -> form control. Kept in its own module (no zod,
 * no server deps) so the browser bundle can render a dynamic form without pulling in
 * the validation registry. core/fields.ts asserts this table matches the adapters.
 */
export type InputKind =
  | "text" | "textarea" | "richtext" | "number" | "money" | "switch" | "date" | "time"
  | "datetime" | "select" | "multiselect" | "radio" | "checkboxes" | "url" | "email"
  | "tel" | "media" | "video" | "file" | "geo" | "duration" | "dims";

export const INPUT_KIND: Record<string, InputKind> = {
  text: "text", textarea: "textarea", richtext: "richtext", number: "number", currency: "money",
  boolean: "switch", date: "date", time: "time", datetime: "datetime", select: "select",
  multiselect: "multiselect", radio: "radio", checkbox: "checkboxes", url: "url", email: "email",
  phone: "tel", image: "media", video: "video", file: "file", location: "geo",
  duration: "duration", dims: "dims",
};

export const inputKindFor = (type: string): InputKind => INPUT_KIND[type] ?? "text";

/** which types need an options list in the admin field builder */
export const TYPES_WITH_OPTIONS = new Set(["select", "multiselect", "radio", "checkbox"]);
/** which types are usable as discovery filters (mirrors adapter.filterable) */
export const TYPES_FILTERABLE = new Set(["text", "number", "currency", "boolean", "date", "datetime", "select", "multiselect", "radio", "checkbox", "location", "duration"]);
export const TYPES_SEARCHABLE = new Set(["text", "textarea", "richtext", "select", "multiselect", "radio", "checkbox", "location"]);
