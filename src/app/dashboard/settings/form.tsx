"use client";

import { useFormState } from "react-dom";
import { updateSettingsAction } from "../actions";
import { Button } from "@/ui/kit";

type Initial = Record<string, string | boolean>;

export function SettingsForm({ businessId, initial, owner }: { businessId: string; initial: Initial; owner: string }) {
  const [state, action] = useFormState(updateSettingsAction, null);
  const err = (n: string) => (state && !state.ok ? state.fields?.[n] : undefined);
  const text = (n: string) => (typeof initial[n] === "string" ? (initial[n] as string) : "");
  return (
    <form action={action} className="card card-pad grid gap-4">
      <input type="hidden" name="businessId" value={businessId} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field name="name" label="Business name" value={text("name")} required error={err("name")} />
        <Field name="slug" label="Web address" value={text("slug")} hint={`/business/${text("slug")}`} error={err("slug")} />
        <Field name="tagline" label="Tagline" value={text("tagline")} hint="One line under your name. About 60 characters reads best." maxLength={120} />
        <Field name="city" label="City" value={text("city")} />
        <Field name="phone" label="Phone" value={text("phone")} type="tel" />
        <Field name="email" label="Email" value={text("email")} type="email" />
        <Field name="address" label="Address" value={text("address")} />
        <Field name="service_area" label="Service area" value={text("service_area")} hint="e.g. Lagos mainland and nationwide dispatch" />
      </div>
      <label className="field md:col-span-2">
        <span className="field-label">About</span>
        <textarea className="textarea" name="description" rows={5} defaultValue={text("description")}
          placeholder="What you sell, how long it takes, what makes you different, what a buyer should know before messaging." />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="input" name="paused" defaultChecked={initial.paused === true} />
        <span>Pause my storefront (buyers see &quot;temporarily unavailable&quot;, nothing is deleted)</span>
      </label>
      {state && !state.ok && !err("name") && !err("slug") ? <p role="alert" className="text-sm text-[var(--color-danger)]">{state.message}</p> : null}
      {state?.ok ? <p role="status" className="text-sm text-[var(--color-ok)]">Saved.</p> : null}
      <div className="flex items-center gap-2">
        <Button type="submit">Save changes</Button>
        <span className="text-xs text-[var(--color-ink-faint)]">Signed in as {owner}</span>
      </div>
    </form>
  );
}

function Field({ name, label, value, hint, error, type = "text", required, maxLength }: {
  name: string; label: string; value: string; hint?: string; error?: string; type?: string; required?: boolean; maxLength?: number;
}) {
  return (
    <label className="field" htmlFor={`s-${name}`}>
      <span className="field-label">{label}</span>
      <input id={`s-${name}`} className="input" name={name} type={type} defaultValue={value} placeholder={hint && name === "slug" ? value : undefined}
        required={required} maxLength={maxLength} aria-invalid={error ? true : undefined} />
      {error ? <span className="field-error" role="alert">{error}</span> : hint && name !== "slug" ? <span className="field-hint">{hint}</span> : null}
      {name === "slug" && !error ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
