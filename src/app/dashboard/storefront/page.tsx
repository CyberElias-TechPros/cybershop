import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { businesses } from "@/db/schema";
import { getDb } from "@/db/client";
import { getSessionUser, requireMembership } from "@/core/auth";
import { StorefrontForm } from "./form";

export const dynamic = "force-dynamic";

const STYLES = [
  { key: "classic", name: "Classic", note: "Balanced, familiar" },
  { key: "modern", name: "Modern", note: "Roomy, cool tones" },
  { key: "editorial", name: "Editorial", note: "Big type, magazine feel" },
  { key: "minimal", name: "Minimal", note: "Quiet, catalogue first" },
  { key: "bold", name: "Bold", note: "Loud headers, strong colour" },
];
const SECTIONS = [
  { key: "hero", label: "Intro banner" }, { key: "featured", label: "Featured items" },
  { key: "catalogue", label: "Catalogue grid" }, { key: "about", label: "About you" },
  { key: "gallery", label: "Photo gallery" }, { key: "faq", label: "Questions buyers ask" },
  { key: "contact", label: "Contact block" }, { key: "location", label: "Map / address" },
];

export default async function StorefrontPage({ searchParams }: { searchParams: Promise<{ business?: string }> }) {
  const { business } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard/storefront");
  const membership = business ? user.memberships.find((m) => m.businessId === business) ?? user.memberships[0]! : user.memberships[0]!;
  await requireMembership(membership.businessId, "storefront.edit");
  const [b] = await getDb().select().from(businesses).where(eq(businesses.id, membership.businessId)).limit(1);
  if (!b) redirect("/signup");
  const sf = (b.storefront ?? {}) as { style?: string; accent?: string | null; sections?: string[] };

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Storefront</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Pick a look and switch sections on or off. A school and a fashion store should not look the same.</p>
      </header>
      <StorefrontForm businessId={b.id} styles={STYLES} sections={SECTIONS} current={{ style: sf.style ?? "classic", accent: sf.accent ?? "", active: sf.sections ?? [] }} previewHref={`/business/${b.slug}`} />
    </div>
  );
}
