import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { catalogueItems, catalogueTypes } from "@/db/schema";
import { getDb } from "@/db/client";
import { getSessionUser, requireMembership } from "@/core/auth";
import { ItemEditor } from "../../editor";
import { loadEditor } from "../../load";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit item" };

export default async function EditItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ business?: string }> }) {
  const { id } = await params;
  const { business } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard/catalogue");
  const membership = business ? user.memberships.find((m) => m.businessId === business) ?? user.memberships[0]! : user.memberships[0]!;
  await requireMembership(membership.businessId, "catalogue.edit");

  const [row] = await getDb().select({ key: catalogueTypes.key })
    .from(catalogueItems)
    .innerJoin(catalogueTypes, eq(catalogueTypes.id, catalogueItems.catalogueTypeId))
    .where(and(eq(catalogueItems.id, id), eq(catalogueItems.businessId, membership.businessId), isNull(catalogueItems.deletedAt)))
    .limit(1);
  if (!row) notFound();

  const loaded = await loadEditor(membership.businessId, row.key, id);
  if ("error" in loaded) notFound();

  return (
    <div>
      <header className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">Editing a {loaded.itemNoun.toLowerCase()}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{loaded.initial.name || "Untitled"}</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Status: {loaded.initial.status === "published" ? "live - buyers can see it" : "not live yet"}. Changes apply the moment you save.
        </p>
      </header>
      <ItemEditor item={loaded} />
    </div>
  );
}
