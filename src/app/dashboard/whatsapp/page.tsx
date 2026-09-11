import { redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { catalogueItems, whatsappNumbers } from "@/db/schema";
import { getDb } from "@/db/client";
import { getSessionUser, requireMembership } from "@/core/auth";
import { whatsappAction } from "../actions";
import { composeEnquiry } from "@/core/wa-actions";
import { Button, Card, EmptyState, Badge } from "@/ui/kit";
import { WaForm } from "./form";

export const dynamic = "force-dynamic";

export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<{ business?: string }> }) {
  const { business } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard/whatsapp");
  const membership = business ? user.memberships.find((m) => m.businessId === business) ?? user.memberships[0]! : user.memberships[0]!;
  await requireMembership(membership.businessId, "whatsapp.manage");

  const db = getDb();
  const [numbers, sample] = await Promise.all([
    db.select().from(whatsappNumbers).where(eq(whatsappNumbers.businessId, membership.businessId)).orderBy(desc(whatsappNumbers.isDefault)),
    db.select({ id: catalogueItems.id, name: catalogueItems.name, price: catalogueItems.price })
      .from(catalogueItems)
      .where(and(eq(catalogueItems.businessId, membership.businessId), eq(catalogueItems.status, "published"), isNull(catalogueItems.deletedAt)))
      .limit(1),
  ]);

  // Live preview of exactly what a buyer will see (plan.md 62) - the trust feature.
  const preview = sample[0]
    ? await composeEnquiry({
        businessId: membership.businessId, businessName: membership.name, itemId: sample[0].id,
        itemName: sample[0].name, price: sample[0].price, pagePath: `/business/${membership.slug}`,
      })
    : null;

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">WhatsApp</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Where your enquiries land. Add more numbers to route sales, support or admissions separately.</p>
      </header>

      <Card>
        <ul className="divide-y divide-[var(--color-line)]">
          {numbers.length === 0 ? (
            <li className="p-4"><EmptyState title="No number yet" body="Buyers cannot reach you until you add one." /></li>
          ) : numbers.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center gap-3 p-3">
              <span className="font-medium">{n.label}</span>
              <span className="font-mono text-sm">{n.e164}</span>
              {n.isDefault ? <Badge tone="ok">default</Badge> : null}
              {!n.isActive ? <Badge tone="warn">disabled</Badge> : null}
              {n.source === "addon" ? <Badge tone="info">add-on</Badge> : null}
              <div className="ml-auto flex gap-1.5">
                {!n.isDefault ? (
                  <form action={whatsappAction}><input type="hidden" name="businessId" value={membership.businessId} /><input type="hidden" name="id" value={n.id} /><input type="hidden" name="op" value="default" /><Button size="sm" variant="ghost">Make default</Button></form>
                ) : null}
                <form action={whatsappAction}><input type="hidden" name="businessId" value={membership.businessId} /><input type="hidden" name="id" value={n.id} /><input type="hidden" name="op" value="toggle" /><Button size="sm" variant="ghost">{n.isActive ? "Disable" : "Enable"}</Button></form>
                <form action={whatsappAction}><input type="hidden" name="businessId" value={membership.businessId} /><input type="hidden" name="id" value={n.id} /><input type="hidden" name="op" value="delete" /><Button size="sm" variant="ghost">Remove</Button></form>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <WaForm businessId={membership.businessId} />

      {preview && !("error" in preview) ? (
        <Card className="card-pad">
          <p className="text-sm font-semibold">Preview - this is the message a buyer sends</p>
          <pre className="mt-2 max-w-prose overflow-x-auto whitespace-pre-wrap rounded-lg bg-[var(--color-paper)] p-3 font-sans text-sm">{preview.text}</pre>
          <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
            WhatsApp opens with this typed out. Nothing is sent until the buyer presses send. Image previews come from the product link, not the message.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
