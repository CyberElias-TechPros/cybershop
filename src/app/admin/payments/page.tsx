import { and, desc, eq, sql } from "drizzle-orm";
import { media, payments, businesses } from "@/db/schema";
import { getDb } from "@/db/client";
import { reviewPaymentAction } from "../actions";
import { Badge, Button, Card, EmptyState, StatusPill } from "@/ui/kit";
import { formatMoney } from "@/lib/util";
import { TABS } from "./tabs";

export const dynamic = "force-dynamic";

export default async function PaymentsQueue({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "pending" } = await searchParams;
  const db = getDb();
  const conds = [eq(payments.status, tab as never)];
  const rows = tab === "all" ? [] : await db.select({ p: payments, biz: businesses, proof: media })
    .from(payments)
    .innerJoin(businesses, eq(businesses.id, payments.businessId))
    .leftJoin(media, eq(media.id, payments.proofMediaId))
    .where(and(...conds))
    .orderBy(desc(payments.submittedAt))
    .limit(100);
  const counts = await db.select({ status: payments.status, n: sql<number>`count(*)::int` }).from(payments).groupBy(payments.status);
  const by = Object.fromEntries(counts.map((c: { status: string; n: number }) => [c.status, Number(c.n)]));
  const list = tab === "all"
    ? await db.select({ p: payments, biz: businesses, proof: media }).from(payments)
        .innerJoin(businesses, eq(businesses.id, payments.businessId))
        .leftJoin(media, eq(media.id, payments.proofMediaId)).orderBy(desc(payments.submittedAt)).limit(100)
    : rows;

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Payments</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            One queue for both paths: bank-transfer proofs (need a human) and card payments (auto-verified by webhook, shown here for reconciliation).
          </p>
        </div>
        <nav className="ml-auto flex gap-1.5" aria-label="Payment status">
          {TABS.map((t) => (
            <a key={t} href={`/admin/payments?tab=${t}`} className={t === tab ? "chip font-semibold" : "chip"}>
              {t[0]!.toUpperCase() + t.slice(1)} {by[t] ? `(${by[t]})` : ""}
            </a>
          ))}
        </nav>
      </header>

      {list.length === 0 ? (
        <EmptyState title={`Nothing ${tab}`} body="When a vendor uploads a transfer receipt it lands here with the amount, the business and the image to check against your bank statement." />
      ) : (
        <ul className="grid gap-3">
          {list.map(({ p, biz, proof }: { p: typeof payments.$inferSelect; biz: typeof businesses.$inferSelect; proof: typeof media.$inferSelect | null }) => (
            <li key={p.id}>
              <Card className="card-pad">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{biz.name}</span>
                  <Badge tone="mute">{biz.city ?? "-"}</Badge>
                  <StatusPill status={p.status} />
                  <span className="ml-auto font-mono text-xs text-[var(--color-ink-faint)]">{p.reference}</span>
                </div>
                <dl className="mt-3 grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="rounded-lg border border-[var(--color-line)] p-2">
                    <p className="text-xs font-semibold text-[var(--color-ink-faint)]">Amount claimed</p>
                    <p className="text-lg font-semibold tabular-nums">{formatMoney(String(p.amountMinor / 100), p.currency)}</p>
                    <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
                      {p.method.replaceAll("_", " ")} · {p.kind} · submitted {new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(p.submittedAt))}
                    </p>
                    {p.payerNote ? <p className="mt-2 border-t border-[var(--color-line)] pt-2 text-xs text-[var(--color-ink-soft)]">&quot;{p.payerNote}&quot;</p> : null}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[var(--color-ink-faint)]">Payment proof</p>
                    {proof ? (
                      <>
                        <p className="mt-1 text-sm">Receipt on file: <code className="text-xs">{proof.originalName}</code></p>
                        <a className="link text-sm" href={`/__media/${proof.storageKey}`} target="_blank" rel="noopener noreferrer">Open receipt (authorised view, audited)</a>
                      </>
                    ) : <p className="mt-1 text-sm text-[var(--color-ink-faint)]">No image attached - typical for a card payment or an admin-granted activation.</p>}
                    {p.rejectionReason ? <p className="mt-2 text-sm text-[var(--color-danger)]">Rejected: {p.rejectionReason}</p> : null}
                  </div>
                </dl>
                {p.status === "pending" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={reviewPaymentAction} className="flex gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="decision" value="verified" />
                      <Button size="sm" variant="primary" type="submit">Approve and activate</Button>
                    </form>
                    <form action={reviewPaymentAction} className="flex gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <input className="input h-9 min-h-0 py-1 text-sm" name="reason" placeholder="Reason the vendor will see (required)" style={{ width: "min(340px, 60vw)" }} />
                      <Button size="sm" variant="danger" type="submit">Reject</Button>
                    </form>
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-[var(--color-ink-faint)]">
        Approving sets the payment, the subscription and the business in one transaction, notifies the vendor and writes an audit row. A receipt is a claim until you verify it.
      </p>
    </div>
  );
}
