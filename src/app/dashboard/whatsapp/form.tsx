"use client";

import { useFormState } from "react-dom";
import { addWhatsappNumberAction } from "../actions";
import { Button } from "@/ui/kit";

export function WaForm({ businessId }: { businessId: string }) {
  const [state, action] = useFormState(addWhatsappNumberAction, null);
  const err = (n: string) => (state && !state.ok ? state.fields?.[n] : undefined);
  return (
    <form action={action} className="card card-pad grid gap-3 md:grid-cols-4">
      <input type="hidden" name="businessId" value={businessId} />
      <label className="field md:col-span-2">
        <span className="field-label">New WhatsApp number</span>
        <input className="input" name="number" placeholder="08031234567 or +234..." inputMode="tel" required aria-invalid={!!err("number")} />
        {err("number") ? <span className="field-error" role="alert">{err("number")}</span> : null}
      </label>
      <label className="field">
        <span className="field-label">Label</span>
        <input className="input" name="label" placeholder="Sales" />
      </label>
      <div className="grid items-end">
        <Button variant="secondary" type="submit">Add number</Button>
      </div>
      {state && !state.ok && !err("number") ? <p role="alert" className="text-sm text-[var(--color-danger)] md:col-span-4">{state.message}</p> : null}
      {state?.ok ? <p role="status" className="text-sm text-[var(--color-ok)] md:col-span-4">Added.</p> : null}
    </form>
  );
}
