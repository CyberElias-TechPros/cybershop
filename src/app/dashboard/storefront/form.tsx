"use client";

import { useFormState } from "react-dom";
import { useState } from "react";
import { saveStorefrontAction } from "../actions";
import { Button } from "@/ui/kit";

export function StorefrontForm({ businessId, styles, sections, current, previewHref }: {
  businessId: string;
  styles: Array<{ key: string; name: string; note: string }>;
  sections: Array<{ key: string; label: string }>;
  current: { style: string; accent: string; active: string[] };
  previewHref: string;
}) {
  const [state, action] = useFormState(saveStorefrontAction, null);
  const [style, setStyle] = useState(current.style);
  const [on, setOn] = useState<Set<string>>(new Set(current.active.length ? current.active : sections.map((s) => s.key)));
  const [order, setOrder] = useState<string[]>(current.active.length ? current.active : sections.map((s) => s.key));

  const toggle = (key: string) => {
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); setOrder((o) => o.filter((x) => x !== key)); }
      else { next.add(key); setOrder((o) => (o.includes(key) ? o : [...o, key])); }
      return next;
    });
  };
  const move = (key: string, dir: -1 | 1) => {
    setOrder((o) => {
      const i = o.indexOf(key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= o.length) return o;
      const next = [...o];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  };

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="businessId" value={businessId} />
      {order.map((k) => <input key={k} type="hidden" name="sections" value={k} />)}

      <fieldset className="card card-pad">
        <legend className="text-sm font-semibold">Style</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {styles.map((s) => (
            <label key={s.key} className={`cursor-pointer rounded-xl border p-3 text-sm transition ${style === s.key ? "border-[var(--color-ink)] bg-[var(--color-paper)] font-semibold" : "border-[var(--color-line)] hover:border-[var(--color-line-strong)]"}`}>
              <input type="radio" className="sr-only" name="style" value={s.key} checked={style === s.key} onChange={() => setStyle(s.key)} />
              {s.name}
              <span className="mt-0.5 block text-xs font-normal text-[var(--color-ink-faint)]">{s.note}</span>
            </label>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-3 text-sm">
          <span className="font-medium">Accent colour</span>
          <input type="color" name="accent" defaultValue={current.accent || "#6d28d9"} className="h-9 w-14 cursor-pointer rounded border border-[var(--color-line-strong)] bg-white" />
          <span className="text-xs text-[var(--color-ink-faint)]">Used on your header rule and links</span>
        </label>
      </fieldset>

      <div className="grid gap-4 lg:grid-cols-2">
        <fieldset className="card card-pad">
          <legend className="text-sm font-semibold">Sections</legend>
          <p className="mt-0.5 text-xs text-[var(--color-ink-faint)]">Tick what appears on your page. Use the arrows to reorder.</p>
          <ul className="mt-2 grid gap-1.5">
            {sections.map((s) => {
              const active = on.has(s.key);
              const pos = order.indexOf(s.key);
              return (
                <li key={s.key} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm ${active ? "border-[var(--color-line-strong)]" : "border-dashed border-[var(--color-line)] opacity-60"}`}>
                  <label className="flex flex-1 items-center gap-2">
                    <input type="checkbox" className="input" checked={active} onChange={() => toggle(s.key)} />
                    {s.label}
                  </label>
                  {active ? (
                    <span className="flex gap-0.5">
                      <button type="button" className="btn btn-ghost btn-sm" aria-label={`Move ${s.label} up`} onClick={() => move(s.key, -1)}>{"\u2191"}</button>
                      <button type="button" className="btn btn-ghost btn-sm" aria-label={`Move ${s.label} down`} onClick={() => move(s.key, 1)}>{"\u2193"}</button>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </fieldset>

        <div className="card card-pad">
          <p className="text-sm font-semibold">Order on the page</p>
          <ol className="mt-2 grid gap-1 text-sm">
            {order.filter((k) => on.has(k)).map((k, i) => (
              <li key={k} className="flex items-center gap-2">
                <span className="grid size-5 place-items-center rounded bg-[var(--color-ink)] text-[.65rem] font-bold text-white">{i + 1}</span>
                {sections.find((s) => s.key === k)?.label ?? k}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-[var(--color-ink-faint)]">Everything here is live the moment you save - no publishing queue.</p>
          <a className="link text-sm" href={previewHref} target="_blank" rel="noopener noreferrer">Open my storefront</a>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit">Save storefront</Button>
        {state?.ok ? <span role="status" className="text-sm text-[var(--color-ok)]">Saved.</span> : null}
        {state && !state.ok ? <span role="alert" className="text-sm text-[var(--color-danger)]">{state.message}</span> : null}
      </div>
    </form>
  );
}
