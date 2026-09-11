"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/kit";
import { addBusinessTypeAction, addFieldAction } from "../actions";

/**
 * Admin field builder (plan.md 3, 24). Deliberately a form per field rather than a
 * drag canvas: the moment a config edit can break every vendor form at once, the
 * interface should be boring, explicit and reversible (BUILD_PLAN 24 R5).
 */
export function AddFieldForm({ typeId, typeKey, fields }: { typeId: string; typeKey: string; fields: Array<{ type: string; label: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return <button type="button" className="link mt-3 text-sm" onClick={() => setOpen(true)}>+ Add a field to “{typeKey}”</button>;
  }
  return (
    <form
      className="mt-3 grid gap-2 rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-paper)] p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        data.set("catalogueTypeId", typeId);
        start(async () => {
          const res = await addFieldAction(null, data);
          if (res && !res.ok) { setMsg(res.message); return; }
          setMsg(null);
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">New field on {typeKey}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <input className="input" name="label" placeholder="Label (Duration)" required />
        <input className="input" name="key" placeholder="key (duration_weeks)" required pattern="[a-z][a-z0-9_]{1,30}" />
        <select className="select" name="type" defaultValue="text">
          {fields.map((f) => <option key={f.type} value={f.type}>{f.label}</option>)}
        </select>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <input className="input" name="placeholder" placeholder="Placeholder text" />
        <input className="input" name="helpText" placeholder="Helper text for the vendor" />
        <input className="input" name="sortOrder" type="number" defaultValue={99} min={0} max={999} aria-label="Sort order" />
      </div>
      <label className="field">
        <span className="text-xs font-medium">Options (one per line, `value|Label` if they differ)</span>
        <textarea className="textarea min-h-[64px] font-mono text-xs" name="options" placeholder={"online|Online\nonsite|On-site"} />
      </label>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5"><input type="checkbox" className="input" name="isRequired" /> Required</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" className="input" name="isFilterable" /> Usable as a filter</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" className="input" name="isSearchable" /> Searchable</label>
        <Button size="sm" type="submit" className="ml-auto" disabled={pending}>{pending ? "Adding..." : "Add field"}</Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      {msg ? <p role="alert" className="text-sm text-[var(--color-danger)]">{msg}</p> : null}
    </form>
  );
}

export function AddTypeForm() {
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      className="card card-pad grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await addBusinessTypeAction(null, new FormData(e.currentTarget));
          if (res && !res.ok) { setMsg(res.message); return; }
          setMsg(null);
          router.refresh();
        });
      }}
    >
      <label className="field">
        <span className="field-label">New business type</span>
        <input className="input" name="name" placeholder="Auto repair garage" required />
      </label>
      <label className="field">
        <span className="field-label">Key</span>
        <input className="input" name="key" placeholder="auto_repair" required pattern="[a-z0-9_]{2,32}" />
      </label>
      <div className="grid items-end"><Button type="submit" disabled={pending}>{pending ? "Creating..." : "Create"}</Button></div>
      {msg ? <p role="alert" className="text-sm text-[var(--color-danger)] sm:col-span-3">{msg}</p> : null}
    </form>
  );
}
