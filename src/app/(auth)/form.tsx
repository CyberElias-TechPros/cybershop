"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import type { AnyResult } from "@/lib/util";

/**
 * Shared auth UI. `children` receives a fieldError() accessor so each input renders
 * its own message - but it must be a plain element tree, not a function prop, so the
 * errors are rendered here from a `names` list instead (functions cannot cross the
 * server/client boundary).
 */
export function AuthShell({ title, sub, children, alt, footer }: {
  title: string; sub: string; children: React.ReactNode; alt?: { href: string; text: string }; footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh place-items-center bg-[var(--color-paper)] px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 inline-flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-[var(--color-ink)] text-[.7rem] font-bold text-white">CS</span>
          Cybershop
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{sub}</p>
        <div className="card mt-5 card-pad">{children}</div>
        {alt ? <p className="mt-4 text-center text-sm text-[var(--color-ink-soft)]"><Link className="link" href={alt.href}>{alt.text}</Link></p> : null}
        {footer}
      </div>
    </div>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Working..." : label}
    </button>
  );
}

export function AuthForm({ action, submit, children, errorNames = [] }: {
  action: (prev: AnyResult | null, form: FormData) => Promise<AnyResult | null>;
  submit: string;
  children: (fieldError: (n: string) => string | undefined) => React.ReactNode;
  errorNames?: string[];
}) {
  const [state, formAction] = useFormState(action, null);
  const fieldError = (n: string) => (state && !state.ok ? state.fields?.[n] : undefined);
  const banner = state && !state.ok && !errorNames.some((n) => fieldError(n)) ? state.message : null;
  return (
    <form action={formAction} className="grid gap-4">
      {banner ? <p role="alert" className="rounded-lg border border-[#f0c0bd] bg-[#fdf1f0] px-3 py-2 text-sm text-[var(--color-danger)]">{banner}</p> : null}
      {children(fieldError)}
      <Submit label={submit} />
    </form>
  );
}

export function AuthInput({ name, label, type = "text", placeholder, autoComplete, hint, required, fieldError, defaultValue }: {
  name: string; label: string; type?: string; placeholder?: string; autoComplete?: string;
  hint?: string; required?: boolean; fieldError?: string; defaultValue?: string;
}) {
  const id = `f-${name}`;
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <input
        id={id} className="input" name={name} type={type} placeholder={placeholder} autoComplete={autoComplete}
        required={required} defaultValue={defaultValue} aria-invalid={fieldError ? true : undefined}
        aria-describedby={fieldError ? `${id}-err` : hint ? `${id}-hint` : undefined}
      />
      {fieldError ? <span className="field-error" id={`${id}-err`} role="alert">{fieldError}</span>
        : hint ? <span className="field-hint" id={`${id}-hint`}>{hint}</span> : null}
    </label>
  );
}
