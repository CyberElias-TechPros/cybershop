"use client";

/**
 * The item composer (plan.md 60): five fields visible, everything else behind
 * "More options". Autosaves drafts so a phone call mid-edit does not cost the work.
 */
import { useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveItemAction } from "../actions";
import { FieldInput } from "@/ui/field-inputs";
import type { FieldDef } from "@/core/fields";
import { formatMoney } from "@/lib/util";

export type EditorItem = {
  id: string | null;
  businessId: string;
  typeKey: string;
  itemNoun: string;
  ctaVerb: string;
  requireImage: boolean;
  updatedAt: string | null;
  defs: FieldDef[];
  values: Record<string, unknown>;
  initial: {
    name: string; summary: string; description: string; price: string; priceType: string;
    sku: string; stockQty: string; isOutOfStock: boolean; status: string; whatsappNumberId: string;
    slug: string;
  };
  numbers: Array<{ id: string; label: string; e164: string; isDefault: boolean }>;
  media: Array<{ id: string; url: string | null; alt: string | null }>;
};

export function ItemEditor({ item }: { item: EditorItem }) {
  const router = useRouter();
  const uid = useId();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(Boolean(item.id));
  const [mediaIds, setMediaIds] = useState(item.media.map((m) => m.id));
  const [mediaUrls, setMediaUrls] = useState<Record<string, string | null>>(
    Object.fromEntries(item.media.map((m) => [m.id, m.url])),
  );
  const [uploading, startUpload] = useTransition();
  const [pending, startSave] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const dirty = useRef(false);
  const timer = useRef<number>(0);

  const core = item.defs.filter((d) => !CORE_HIDDEN.has(d.key) && !d.isAdvancedDefault);
  const advanced = item.defs.filter((d) => CORE_HIDDEN.has(d.key) || d.isAdvancedDefault);

  const submit = (status: "draft" | "published") => {
    if (!formRef.current) return;
    const form = new FormData(formRef.current);
    form.set("status", status);
    form.set("mediaIds", mediaIds.join(","));
    form.set("expectedUpdatedAt", item.updatedAt ?? "");
    startSave(async () => {
      const res = await saveItemAction(null, form);
      if (res && !res.ok) {
        setErrors(res.fields ?? {});
        setBanner(res.message);
        document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setErrors({}); setBanner(null); setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      if (status === "published") router.push("/dashboard/catalogue");
      else router.refresh();
    });
  };

  // autosave drafts, debounced: plan.md 13.3 for an audience that gets interrupted.
  // New items only - never silently rewrite something already live.
  const onInput = () => {
    dirty.current = true;
    if (item.id !== null) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!dirty.current) return;
      dirty.current = false;
      submit("draft");
    }, 2500);
  };

  const onFiles = (files: FileList | null) => {
    if (!files?.length) return;
    startUpload(async () => {
      for (const file of Array.from(files).slice(0, 10)) {
        const fd = new FormData();
        fd.set("file", file);
        const res = await fetch(`/api/media/upload?business=${item.businessId}`, { method: "POST", body: fd });
        const json = (await res.json()) as { id?: string; url?: string; error?: string };
        if (!res.ok || !json.id) { setBanner(json.error ?? "Upload failed. Try a smaller photo."); continue; }
        setMediaIds((prev) => (prev.includes(json.id!) ? prev : [...prev, json.id!]));
        setMediaUrls((prev) => ({ ...prev, [json.id!]: json.url ?? null }));
      }
    });
  };

  const hasHero = mediaIds.length > 0;

  return (
    <form ref={formRef} onChange={onInput} onInput={onInput} className="grid gap-5" encType="multipart/form-data">
      <input type="hidden" name="businessId" value={item.businessId} />
      <input type="hidden" name="id" value={item.id ?? ""} />
      <input type="hidden" name="typeKey" value={item.typeKey} />
      <input type="hidden" name="requireImage" value={item.requireImage ? "1" : "0"} />
      {mediaIds.map((m) => <input key={m} type="hidden" name="media" value={m} />)}

      {banner ? <p role="alert" className="rounded-lg border border-[#f0c0bd] bg-[#fdf1f0] px-3 py-2 text-sm text-[var(--color-danger)]">{banner}</p> : null}
      {savedAt && !banner ? <p role="status" className="rounded-lg border border-[#b7e0c4] bg-[#f0fbf3] px-3 py-2 text-sm text-[var(--color-ok)]">Draft saved at {savedAt}.</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="field md:col-span-2">
          <span className="field-label">{item.itemNoun} name</span>
          <input className="input" name="name" defaultValue={item.initial.name} required placeholder="e.g. Ankara Maxi Dress" aria-invalid={!!errors.name} />
          {errors.name ? <span className="field-error">{errors.name}</span> : null}
        </label>

        <label className="field">
          <span className="field-label">Price {item.initial.priceType === "on_request" ? "(leave blank to hide)" : ""}</span>
          <div className="relative">
            <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)]">{"\u20a6"}</span>
            <input className="input pl-7" name="price" inputMode="decimal" defaultValue={item.initial.price} placeholder="45000" aria-invalid={!!errors.price} />
          </div>
          {errors.price ? <span className="field-error">{errors.price}</span> : null}
        </label>

        <label className="field">
          <span className="field-label">Which WhatsApp number gets this enquiry?</span>
          <select className="select" name="whatsappNumberId" defaultValue={item.initial.whatsappNumberId}>
            {item.numbers.length === 0 ? <option value="">Add a number first</option> : null}
            {item.numbers.map((n) => <option key={n.id} value={n.id}>{n.label} {n.isDefault ? "(default)" : ""}</option>)}
          </select>
        </label>

        <label className="field md:col-span-2">
          <span className="field-label">One-line summary (shows in search and WhatsApp preview)</span>
          <input className="input" name="summary" defaultValue={item.initial.summary} maxLength={160} placeholder="Hand-cut maxi dress in premium Ankara print" />
        </label>

        <label className="field md:col-span-2">
          <span className="field-label">Description</span>
          <textarea className="textarea" name="description" rows={5} defaultValue={item.initial.description}
            placeholder="What is it, what is included, how long it takes, what a buyer should know before messaging." />
        </label>
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-semibold">Photos</legend>
        <ul className="flex flex-wrap gap-2">
          {mediaIds.map((m, i) => (
            <li key={m} className="relative size-24 overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-line)]">
              {mediaUrls[m] ? <img src={mediaUrls[m]!} alt="" width={96} height={96} className="size-full object-cover" /> : null}
              {i === 0 ? <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center text-[.6rem] text-white">cover</span> : null}
              <button type="button" aria-label="Remove photo" onClick={() => setMediaIds((prev) => prev.filter((x) => x !== m))}
                className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/60 text-xs text-white hover:bg-black">×</button>
            </li>
          ))}
          <li>
            <label className="grid size-24 cursor-pointer place-items-center rounded-lg border border-dashed border-[var(--color-line-strong)] text-center text-[.7rem] text-[var(--color-ink-faint)] hover:border-[var(--color-ink)]">
              {uploading ? "Uploading..." : "+ Add photo"}
              <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => onFiles(e.target.files)} />
            </label>
          </li>
        </ul>
        {errors.media ? <span className="field-error">{errors.media}</span> : null}
        {!hasHero && item.requireImage ? <span className="field-hint">Listings with a photo get several times more WhatsApp clicks.</span> : null}
      </fieldset>

      {core.length ? (
        <fieldset className="grid gap-4 border-t border-[var(--color-line)] pt-4">
          <legend className="sr-only">Details for {item.itemNoun.toLowerCase()}</legend>
          <div className="grid gap-4 md:grid-cols-2">
            {core.map((d) => (
              <FieldInput key={d.id} def={d} error={errors[d.key] ?? null} defaultValue={item.values[d.key] ?? d.defaultValue ?? ""} />
            ))}
          </div>
        </fieldset>
      ) : null}

      {advanced.length ? (
        <div className="border-t border-[var(--color-line)] pt-4">
          <button type="button" className="link text-sm" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
            {showMore ? "Hide extra options" : "More options (SKU, stock, link, SEO)"}
          </button>
          {showMore ? (
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <label className="field">
                <span className="field-label">SKU / reference</span>
                <input className="input" name="sku" defaultValue={item.initial.sku} placeholder="AMD-001" />
              </label>
              <label className="field">
                <span className="field-label">Stock quantity (optional)</span>
                <input className="input" name="stockQty" inputMode="numeric" defaultValue={item.initial.stockQty} placeholder="leave blank if you do not track" />
              </label>
              <label className="field">
                <span className="field-label">Price wording</span>
                <select className="select" name="priceType" defaultValue={item.initial.priceType}>
                  <option value="fixed">Fixed price</option>
                  <option value="from">From this price</option>
                  <option value="on_request">Price on request</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Web address</span>
                <input className="input" name="slug" defaultValue={item.initial.slug} placeholder={item.initial.slug || "auto from name"} />
              </label>
              <label className="field">
                <span className="flex items-center gap-2">
                  <input type="checkbox" className="input" name="isOutOfStock" defaultChecked={item.initial.isOutOfStock} />
                  <span className="field-label">Out of stock</span>
                </span>
              </label>
              {advanced.map((d) => (
                <FieldInput key={d.id} def={d} error={errors[d.key] ?? null} defaultValue={item.values[d.key] ?? ""} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-paper)_92%,transparent)] px-4 py-3 backdrop-blur md:static md:border-0 md:bg-transparent md:px-0">
        <button type="button" className="btn btn-wa btn-lg" disabled={pending} onClick={() => submit("published")}>
          {pending ? "Saving..." : item.initial.status === "published" ? "Save and keep live" : "Save and publish"}
        </button>
        <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => submit("draft")}>
          Save as draft
        </button>
        <span className="ml-auto text-xs text-[var(--color-ink-faint)]">
          {item.id ? "Editing" : "New"} {item.itemNoun.toLowerCase()} · buyers see: {item.ctaVerb} on WhatsApp
        </span>
      </div>
    </form>
  );
}

/** keys that always live in the core form, so they are not duplicated in the dynamic block */
const CORE_HIDDEN = new Set(["price", "name", "description", "summary", "sku"]);
