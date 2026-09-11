"use client";

import { AuthForm, AuthInput, AuthShell } from "../form";
import type { AnyResult } from "@/lib/util";

const TYPES = ["Retail shop", "School / academy", "Beauty & salon", "Real estate", "Food & kitchen", "Professional services"];

export function SignupClient({ action }: { action: (prev: AnyResult | null, form: FormData) => Promise<AnyResult | null> }) {
  return (
    <AuthShell
      title="Open your store on Cybershop"
      sub="About four minutes, no card. You keep closing sales in WhatsApp - we write the message for you."
      alt={{ href: "/login", text: "I already have an account" }}
    >
      <AuthForm
        action={action}
        submit="Create my store"
        errorNames={["name", "businessName", "email", "password", "whatsapp"]}
      >
        {(err) => (
          <>
            <AuthInput name="name" label="Your name" autoComplete="name" required fieldError={err("name")} />
            <AuthInput name="businessName" label="Business name" placeholder="e.g. Amara Fashion" required fieldError={err("businessName")} />
            <div className="grid gap-4 sm:grid-cols-2">
              <AuthInput name="city" label="City" placeholder="Ikeja" />
              <AuthInput name="whatsapp" label="WhatsApp number" placeholder="08031234567" required
                hint="Buyers are sent here with their details typed out." fieldError={err("whatsapp")} />
            </div>
            <AuthInput name="email" label="Email" type="email" autoComplete="email" required fieldError={err("email")} />
            <AuthInput name="password" label="Password" type="password" autoComplete="new-password" required
              hint="At least 8 characters." fieldError={err("password")} />
            <p className="text-xs text-[var(--color-ink-faint)]">
              In the next step you pick what you sell ({TYPES.join(", ").toLowerCase()}) and add your first item. Nothing is published until you say so.
            </p>
          </>
        )}
      </AuthForm>
    </AuthShell>
  );
}
