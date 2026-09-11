import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { businesses } from "@/db/schema";
import { getDb } from "@/db/client";
import { getSessionUser, requireMembership } from "@/core/auth";
import { updateSettingsAction } from "../actions";
import { SettingsForm } from "./form";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ business?: string }> }) {
  const { business } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard/settings");
  const membership = business ? user.memberships.find((m) => m.businessId === business) ?? user.memberships[0]! : user.memberships[0]!;
  const { user: u } = await requireMembership(membership.businessId, "business.update");
  const [b] = await getDb().select().from(businesses).where(eq(businesses.id, membership.businessId)).limit(1);
  if (!b) redirect("/signup");

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Store settings</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          This is what buyers see on your storefront. Changing your web address breaks old links, so only do it if you have not printed them yet.
        </p>
      </header>
      <SettingsForm
        businessId={b.id}
        initial={{
          name: b.name, slug: b.slug, tagline: b.tagline ?? "", description: b.description ?? "",
          city: b.city ?? "", phone: b.phone ?? "", email: b.email ?? "", address: b.address ?? "",
          service_area: b.serviceArea ?? "", paused: b.visibilityPausedByVendor,
        }}
        owner={u.name}
      />
    </div>
  );
}
