"use client";

/**
 * Renders a catalogue item's dynamic fields from the registry (BUILD_PLAN 6.2).
 * The vendor form, the validation messages and the "More options" reveal all come from
 * the same metadata - adding a field in admin changes this form with no deploy.
 */
import { useId } from "react";
import { inputKindFor } from "@/core/field-inputs";
import type { FieldDef } from "@/core/fields";

type Props = {
  def: FieldDef;
  error?: string | null;
  defaultValue?: unknown;
  advanced?: boolean;
  mediaIds?: string[];
  onPickMedia?: (id: string | null) => void;
};

export function FieldInput({ def, error, defaultValue, mediaIds = [], onPickMedia }: Props) {
  const uid = useId();
  const id = `${uid}-${def.key}`;
  const name = `f:${def.key}`;
  const invalid = !!error;
  const val = defaultValue ?? "";
  const describedBy = error ? `${id}-err` : def.helpText ? `${id}-hint` : undefined;

  const label = (
    <span className="field-label">
      {def.label}
      {def.isRequired ? <span className="text-[.7rem] font-normal text-[var(--color-danger)]">required</span> : null}
    </span>
  );
  const extras = (
    <>
      {def.helpText ? <span className="field-hint" id={`${id}-hint`}>{def.helpText}</span> : null}
      {error ? <span className="field-error" id={`${id}-err`} role="alert">{error}</span> : null}
    </>
  );
  const opts = def.options ?? [];
  const common = { id, name, "aria-invalid": invalid || undefined, "aria-describedby": describedBy, className: "input" } as const;

  switch (inputKind(def)) {
    case "text":
    case "url":
    case "email":
    case "tel":
    case "number":
    case "date":
    case "time":
    case "datetime":
      return (
        <label className="field">
          {label}
          <input {...common} type={inputKind(def) === "datetime" ? "datetime-local" : inputKind(def)}
            defaultValue={String(val)} placeholder={def.placeholder ?? undefined}
            min={(def.validation.min as number | undefined)} max={(def.validation.max as number | undefined)} />
          {extras}
        </label>
      );
    case "money":
      return (
        <label className="field">
          {label}
          <div className="relative">
            <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)]">{"\u20a6"}</span>
            <input {...common} type="text" inputMode="decimal" className="input pl-7"
              defaultValue={String(val)} placeholder={def.placeholder ?? "0"} />
          </div>
          {extras}
        </label>
      );
    case "textarea":
      return (
        <label className="field">
          {label}
          <textarea {...common} className="textarea" defaultValue={String(val)} rows={4} placeholder={def.placeholder ?? undefined} />
          {extras}
        </label>
      );
    case "richtext":
      return (
        <label className="field">
          {label}
          <textarea {...common} className="textarea font-mono text-[.8125rem]" defaultValue={String(val)} rows={6}
            placeholder="Plain text or simple HTML: <p>, <ul>, <li>, <strong>" />
          {extras}
        </label>
      );
    case "select":
    case "radio":
      return (
        <div className="field">
          <span className="field-label">{def.label}</span>
          {inputKind(def) === "select" ? (
            <select className="select" id={id} name={name} defaultValue={String(val)} aria-invalid={invalid || undefined} aria-describedby={describedBy}>
              <option value="">{def.placeholder ?? "Choose one"}</option>
              {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={def.label}>
              {opts.map((o) => (
                <label key={o.value} className="chip cursor-pointer">
                  <input type="radio" name={name} value={o.value} defaultChecked={String(val) === o.value} /> {o.label}
                </label>
              ))}
            </div>
          )}
          {extras}
        </div>
      );
    case "multiselect":
    case "checkboxes":
      return (
        <div className="field">
          <span className="field-label">{def.label}</span>
          <div className="flex flex-wrap gap-2">
            {opts.map((o) => (
              <label key={o.value} className="chip cursor-pointer">
                <input
                  type="checkbox" name={inputKind(def) === "multiselect" ? `fm:${def.key}` : `fm:${def.key}`} value={o.value}
                  defaultChecked={Array.isArray(val) && (val as string[]).includes(o.value)}
                  onChange={(e) => {
                    const holder = e.currentTarget.closest("div")?.parentElement?.querySelector(`input[name="f:${def.key}"]`) as HTMLInputElement | null;
                    if (!holder) return;
                    const picked = [...(e.currentTarget.closest("div")?.querySelectorAll("input:checked") ?? [])].map((i) => (i as HTMLInputElement).value);
                    holder.value = JSON.stringify(picked);
                  }}
                /> {o.label}
              </label>
            ))}
          </div>
          <input type="hidden" name={`f:${def.key}`} value={JSON.stringify(Array.isArray(val) ? val : [])} />
          {extras}
        </div>
      );
    case "switch":
      return (
        <label className="field">
          <span className="flex items-center gap-2">
            <input type="checkbox" id={id} name={name} className="input" defaultChecked={val === true || val === "on" || val === "true"} />
            <span className="field-label">{def.label}</span>
          </span>
          {extras}
        </label>
      );
    case "media":
    case "video":
    case "file":
      return (
        <div className="field">
          <span className="field-label">{def.label}</span>
          <div className="flex flex-wrap gap-2">
            {mediaIds.map((m) => <span key={m} className="chip">{m.slice(0, 8)}\u2026</span>)}
            {!mediaIds.length ? <span className="text-sm text-[var(--color-ink-faint)]">Nothing attached yet</span> : null}
          </div>
          {onPickMedia ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPickMedia(null)}>Choose from media library</button> : null}
          {extras}
        </div>
      );
    case "geo":
      return (
        <label className="field">
          {label}
          <input {...common} type="text" defaultValue={typeof val === "object" && val ? String((val as { label?: string }).label ?? "") : String(val)}
            placeholder="e.g. Lekki Phase 1, Lagos" />
          {extras}
        </label>
      );
    case "duration":
      return (
        <label className="field">
          {label}
          <div className="flex gap-2">
            <input {...common} type="number" min={0} defaultValue={String(val)} className="input" />
            <span className="grid place-items-center text-sm text-[var(--color-ink-faint)]">{String(def.config.unit ?? "weeks")}</span>
          </div>
          {extras}
        </label>
      );
    case "dims":
      return (
        <fieldset className="field">
          <legend className="field-label">{def.label}</legend>
          <div className="flex gap-2">
            {(["l", "w", "h"] as const).map((k) => (
              <input key={k} className="input" type="number" min={0} aria-label={`${def.label} ${k === "l" ? "length" : k === "w" ? "width" : "height"}`}
                defaultValue={String(((val ?? {}) as Record<string, unknown>)[k] ?? "")} name={`${name}:${k}`} />
            ))}
          </div>
          {extras}
        </fieldset>
      );
    default:
      return (
        <label className="field">
          {label}
          <input {...common} type="text" defaultValue={String(val)} />
          {extras}
        </label>
      );
  }
}

const inputKind = (def: FieldDef) => inputKindFor(def.type);
