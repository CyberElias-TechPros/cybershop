import type { Env } from '../config';
import { paystackMock } from '../config';
import { toCsv } from './csv';

/**
 * Payment reconciliation.
 *
 * A marketplace that cannot prove its own books is one bad week from a very
 * awkward conversation. CyberShop records a `payments` row and Paystack records
 * a transaction; those two lists must agree. They can disagree in four ways, and
 * each one is a real incident:
 *
 *   missing_on_paystack — we activated a plan but no money arrived.
 *   amount_mismatch     — money arrived, but less (or more) than we recorded.
 *   missing_locally     — money arrived and no payment row claims it.
 *   status_mismatch     — Paystack says failed, we say approved.
 *
 * Runs on demand (Admin → Reconciliation) and daily from the cron for
 * yesterday. In mock mode there is nothing to reconcile against, and it says so
 * rather than producing an empty report that looks like "all clear".
 */

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface Discrepancy {
  kind: 'missing_on_paystack' | 'amount_mismatch' | 'missing_locally' | 'status_mismatch';
  reference: string;
  local_amount_kobo: number | null;
  paystack_amount_kobo: number | null;
  local_status: string | null;
  paystack_status: string | null;
  payment_id: number | null;
  business_id: number | null;
  created_at: string | null;
  /** Plain-English note for the admin screen. */
  note: string;
}

export interface Reconciliation {
  ok: boolean;
  /** False in mock mode — there is no Paystack to ask. */
  available: boolean;
  reason?: string;
  from: string;
  to: string;
  checked: number;
  matched: number;
  paystack_count: number;
  discrepancies: Discrepancy[];
  totals: { local_approved_kobo: number; paystack_success_kobo: number };
}

interface PaystackTxn {
  reference?: string;
  amount?: number;
  status?: string;
  paid_at?: string;
}

const DAY = 86400_000;

/**
 * Pull every transaction Paystack settled in a window, following pagination.
 * `fetcher` is injected so the tests can reconcile without touching the network.
 */
export async function listPaystackTransactions(
  env: Env,
  fromIso: string,
  toIso: string,
  fetcher: Fetcher = fetch
): Promise<{ ok: boolean; transactions: PaystackTxn[]; error?: string }> {
  if (paystackMock(env)) return { ok: false, transactions: [], error: 'mock mode' };
  const out: PaystackTxn[] = [];
  for (let page = 1; page <= 20; page++) {
    const url =
      `https://api.paystack.co/transaction?perPage=100&page=${page}` +
      `&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
    const res = await fetcher(url, { headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` } });
    if (!res.ok) return { ok: false, transactions: out, error: `paystack ${res.status}` };
    const json = (await res.json()) as { data?: PaystackTxn[]; meta?: { total?: number; per_page?: number } };
    const batch = json.data ?? [];
    out.push(...batch);
    const perPage = json.meta?.per_page ?? 100;
    if (batch.length < perPage) break;
  }
  return { ok: true, transactions: out };
}

export async function reconcilePayments(
  env: Env,
  args: { from?: string; to?: string; fetcher?: Fetcher } = {}
): Promise<Reconciliation> {
  const to = args.to ?? new Date().toISOString().slice(0, 10);
  const from = args.from ?? new Date(Date.now() - DAY).toISOString().slice(0, 10);
  const fromIso = `${from}T00:00:00.000Z`;
  const toIso = `${to}T23:59:59.999Z`;

  const localRows = (await env.DB.prepare(
    `SELECT id, reference, paystack_reference, amount, status, method, business_id, created_at
     FROM payments
     WHERE created_at >= ? AND created_at <= ?`
  ).bind(fromIso, toIso).all()).results as {
    id: number;
    reference: string;
    paystack_reference: string | null;
    amount: number;
    status: string;
    method: string;
    business_id: number;
    created_at: string;
  }[];

  const base: Reconciliation = {
    ok: true,
    available: true,
    from,
    to,
    checked: 0,
    matched: 0,
    paystack_count: 0,
    discrepancies: [],
    totals: { local_approved_kobo: 0, paystack_success_kobo: 0 },
  };

  const pulled = await listPaystackTransactions(env, fromIso, toIso, args.fetcher ?? fetch);
  if (!pulled.ok) {
    return {
      ...base,
      available: false,
      reason:
        pulled.error === 'mock mode'
          ? 'Paystack is in mock mode — there are no real transactions to reconcile. Turn PAYSTACK_MOCK off and set live keys.'
          : `Could not reach Paystack (${pulled.error}). Try again in a moment.`,
    };
  }

  const byRef = new Map<string, PaystackTxn>();
  for (const t of pulled.transactions) {
    if (t.reference) byRef.set(t.reference, t);
    if (t.status === 'success') base.totals.paystack_success_kobo += Number(t.amount ?? 0);
  }
  base.paystack_count = pulled.transactions.length;

  const seen = new Set<string>();

  for (const p of localRows) {
    // We only reconcile payments that were meant to go through Paystack.
    if (p.method !== 'paystack') continue;
    base.checked++;
    const ref = p.paystack_reference || p.reference;
    seen.add(ref);
    const txn = byRef.get(ref);

    if (p.status === 'approved') base.totals.local_approved_kobo += Number(p.amount ?? 0);

    if (!txn) {
      // Bank transfers have no Paystack transaction; anything else is a problem.
      base.discrepancies.push({
        kind: 'missing_on_paystack',
        reference: ref,
        local_amount_kobo: Number(p.amount ?? 0),
        paystack_amount_kobo: null,
        local_status: p.status,
        paystack_status: null,
        payment_id: p.id,
        business_id: p.business_id,
        created_at: p.created_at,
        note:
          p.status === 'approved'
            ? 'Approved locally but Paystack has no such transaction. Either the money never arrived or the reference was lost.'
            : 'No matching Paystack transaction (expected for an abandoned checkout).',
      });
      continue;
    }

    const paystackAmount = Number(txn.amount ?? 0);
    const localAmount = Number(p.amount ?? 0);
    if (p.status === 'approved' && (txn.status ?? '') !== 'success') {
      base.discrepancies.push({
        kind: 'status_mismatch',
        reference: ref,
        local_amount_kobo: localAmount,
        paystack_amount_kobo: paystackAmount,
        local_status: p.status,
        paystack_status: txn.status ?? null,
        payment_id: p.id,
        business_id: p.business_id,
        created_at: p.created_at,
        note: `We marked this approved; Paystack says “${txn.status}”.`,
      });
    } else if (p.status === 'approved' && paystackAmount !== localAmount) {
      base.discrepancies.push({
        kind: 'amount_mismatch',
        reference: ref,
        local_amount_kobo: localAmount,
        paystack_amount_kobo: paystackAmount,
        local_status: p.status,
        paystack_status: txn.status ?? null,
        payment_id: p.id,
        business_id: p.business_id,
        created_at: p.created_at,
        note: `Recorded ${(localAmount / 100).toFixed(2)} NGN, Paystack settled ${(paystackAmount / 100).toFixed(2)} NGN.`,
      });
    } else {
      base.matched++;
    }
  }

  for (const [ref, txn] of byRef) {
    if (seen.has(ref)) continue;
    if ((txn.status ?? '') !== 'success') continue;
    base.discrepancies.push({
      kind: 'missing_locally',
      reference: ref,
      local_amount_kobo: null,
      paystack_amount_kobo: Number(txn.amount ?? 0),
      local_status: null,
      paystack_status: txn.status ?? null,
      payment_id: null,
      business_id: null,
      created_at: txn.paid_at ?? null,
      note: 'Paystack settled this but no payment row claims it — most often a webhook that never arrived.',
    });
  }

  return base;
}

/** The discrepancy table as spreadsheet rows. */
export function reconciliationRows(r: Reconciliation): unknown[][] {
  const rows: unknown[][] = [
    ['kind', 'reference', 'local_ngn', 'paystack_ngn', 'local_status', 'paystack_status', 'payment_id', 'created_at', 'note'],
  ];
  for (const d of r.discrepancies) {
    rows.push([
      d.kind,
      d.reference,
      d.local_amount_kobo === null ? '' : (d.local_amount_kobo / 100).toFixed(2),
      d.paystack_amount_kobo === null ? '' : (d.paystack_amount_kobo / 100).toFixed(2),
      d.local_status ?? '',
      d.paystack_status ?? '',
      d.payment_id === null ? '' : String(d.payment_id),
      d.created_at ?? '',
      d.note,
    ]);
  }
  return rows;
}

/** The same table as a CSV string. */
export function reconciliationCsv(r: Reconciliation): string {
  return toCsv(reconciliationRows(r));
}
