import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, requireMembership } from "@/core/auth";
import { ItemEditor } from "../editor";
import { loadEditor } from "../load";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add item" };

export default async function NewItemPage({ searchParams }: { searchParams: Promise<{ business?: string; type?: string }> }) {
  const { business, type = "product" } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard/catalogue/new");
  const membership = business ? user.memberships.find((m) => m.businessId === business) ?? user.memberships[0]! : user.memberships[0]!;
  if (!membership) redirect("/signup");
  await requireMembership(membership.businessId, "catalogue.edit");

  const loaded = await loadEditor(membership.businessId, type, null);
  if ("error" in loaded) {
    return (
      <div className="card card-pad">
        <h1 className="text-lg font-semibold">Cannot open the editor</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{loaded.error}</p>
        <p className="mt-3"><Link className="link" href="/dashboard/catalogue">Back to catalogue</Link></p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">{loaded.itemNoun} for {membership.name}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Add your {loaded.itemNoun.toLowerCase()}</h1>
        <p className="mt-1 max-w-prose text-sm text-[var(--color-ink-soft)]">
          Only name, price and one photo are needed. Everything else is optional - you can add it later without losing your place.
        </p>
      </header>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {["product", "course", "service", "appointment"].map((t) => (
          <Link key={t} href={`/dashboard/catalogue/new?type=${t}&business=${membership.businessId}`}
            className={t === type ? "chip border-[var(--color-ink)] font-semibold" : "chip"}>{t}</Link>
        ))}
      </div>
      <ItemEditor item={loaded} />
    </div>
  );
}
