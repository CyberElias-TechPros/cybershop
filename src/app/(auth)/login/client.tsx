"use client";

import { AuthForm, AuthInput, AuthShell } from "../form";
import type { AnyResult } from "@/lib/util";

export function AuthClient({ action }: { action: (prev: AnyResult | null, form: FormData) => Promise<AnyResult | null> }) {
  return (
    <AuthShell
      title="Welcome back"
      sub="Your storefront, catalogue and enquiries are in here."
      alt={{ href: "/signup", text: "Open a new store" }}
      footer={
        <p className="mt-4 rounded-lg bg-white p-3 text-xs text-[var(--color-ink-faint)]">
          Demo accounts · vendor: <code>hello@amarafashion.test</code> · admin: <code>admin@cybershop.test</code> · password <code>Cybershop#2026</code>
        </p>
      }
    >
      <AuthForm action={action} submit="Sign in" errorNames={["email", "password"]}>
        {(err) => (
          <>
            <AuthInput name="email" label="Email" type="email" autoComplete="username" required fieldError={err("email")} />
            <AuthInput name="password" label="Password" type="password" autoComplete="current-password" required fieldError={err("password")} />
          </>
        )}
      </AuthForm>
    </AuthShell>
  );
}
