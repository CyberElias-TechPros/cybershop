import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { catalogueItems, catalogueTypes, itemMedia, media } from "@/db/schema";
import { getDb } from "@/db/client";
import { requireMembership } from "@/core/auth";
import { getSessionUser } from "@/core/auth";
import { Badge, Button, Card, EmptyState, FormMessage, Money, StatusPill, Tabs } from "@/ui/kit";
import { countItems } from "@/db/read";
import { duplicateItemAction, itemStatusAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function CataloguePage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; business?: string }> }) {
  const { tab = "all", q = "", business: wanted } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard/catalogue");
  const membership = wanted
    ? user.memberships.find((m) => m.businessId === wanted) ?? user.memberships[0]!
    : user.memberships[0]!;
  await requireMembership(membership.businessId, "catalogue.view");

  const db = getDb();
  const statusCond = {
    all: sql`true`, active: eq(catalogueItems.status, "published"), draft: eq(catalogueItems.status, "draft"),
    out: eq(catalogueItems.isOutOfStock, true), archived: or(eq(catalogueItems.status, "archived"), eq(catalogueItems.status, "unpublished")),
  }[tab] ?? sql`true`;

  const conds = [eq(catalogueItems.businessId, membership.businessId), isNull(catalogueItems.deletedAt), statusCond];
  if (q.trim()) conds.push(sql`lower(${catalogueItems.name}) like ${`%${q.toLowerCase().trim()}%`}`);

  const rows = await db.select({ item: catalogueItems, type: catalogueTypes, heroUrl: sql<string | null>`(select m.public_url from item_media im join media m on m.id = im.media_id where im.item_id = ${catalogueItems.id} order by im.sort_order limit 1)` })
    .from(catalogueItems).innerJoin(catalogueTypes, eq(catalogueTypes.id, catalogueItems.catalogueTypeId))
    .where(and(...conds)).orderBy(desc(catalogueItems.updatedAt)).limit(60);
  const { total, published } = await countItems(membership.businessId);

  return (
    <div>
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Catalogue</h1>
          <p className="text-sm text-[var(--color-ink-faint)]">{published} live · {total} total</p>
        </div>
        <Button className="ml-auto" variant="wa" href={`/dashboard/catalogue/new?business=${membership.businessId}`}>+ Add item</Button>
      </header>

      <div className="mt-4 grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs basePath="/dashboard/catalogue" current={tab}
            items={[{ key: "all", label: "All", count: total }, { key: "active", label: "Live" }, { key: "draft", label: "Drafts" }, { key: "out", label: "Out of stock" }, { key: "archived", label: "Hidden" }]} />
          <form className="ml-auto flex gap-2" role="search">
            <input className="input h-9 min-h-0 py-1 text-sm" name="q" defaultValue={q} placeholder="Search your items" aria-label="Search your items" />
            <input type="hidden" name="tab" value={tab} />
            <Button size="sm" type="submit">Search</Button>
          </form>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title={q ? "Nothing matches that search" : "Your catalogue is empty"}
            body={q ? "Try a shorter word. Only items in this store are searched." : "Add your first item - name, price and one photo is enough to go live. You can add details later."}
            action={<Button variant="wa" href={`/dashboard/catalogue/new?business=${membership.businessId}`}>Add your first item</Button>}
          />
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-[var(--color-line)]">
              {rows.map(({ item, type, heroUrl }) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 p-3">
                  <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--color-line)]">
                    {heroUrl ? <img src={heroUrl} alt="" width={56} height={56} className="size-full object-cover" /> : <span className="text-[.65rem] text-[var(--color-ink-faint)]">no photo</span>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-ink-faint)]">
                      <Money value={item.priceType === "on_request" ? null : item.price} currency={item.currency} />
                      <span aria-hidden>·</span> {type.itemNoun}
                      {item.isOutOfStock ? <Badge tone="danger">Out of stock</Badge> : null}
                      {item.isFeatured ? <Badge tone="info">Featured</Badge> : null}
                      <StatusPill status={item.status} />
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="secondary" href={`/dashboard/catalogue/${item.id}/edit?business=${membership.businessId}`}>Edit</Button>
                    <form action={duplicateItemAction}>
                      <input type="hidden" name="businessId" value={membership.businessId} />
                      <input type="hidden" name="id" value={item.id} />
                      <Button size="sm" variant="ghost" type="submit">Duplicate</Button>
                    </form>
                    {item.status === "published" ? (
                      <form action={itemStatusAction}>
                        <input type="hidden" name="businessId" value={membership.businessId} />
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="status" value="unpublished" />
                        <Button size="sm" variant="ghost" type="submit">Hide</Button>
                      </form>
                    ) : (
                      <form action={itemStatusAction}>
                        <input type="hidden" name="businessId" value={membership.businessId} />
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="status" value="published" />
                        <Button size="sm" variant="ghost" type="submit">Publish</Button>
                      </form>
                    )}
                    <Button size="sm" variant="ghost" href={`/business/${membership.slug}/${type.key}/${item.slug}`}>View</Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <FormMessage error={null} />
      </div>
    </div>
  );
}
