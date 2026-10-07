import { describe, it, expect, beforeAll } from 'vitest';
import { setupIntegration, api, adminLoginBody } from './harness';

/**
 * Payment reconciliation.
 *
 * Paystack holds the money; this database holds the subscriptions. Two ledgers,
 * two systems, and the interesting days are the ones where they disagree. The
 * harness injects a fake Paystack so the four disagreement shapes can be
 * exercised without touching a real account.
 */
setupIntegration();

let adminCookie = '';

beforeAll(async () => {
  const r = await api('/api/auth/login', { method: 'POST', body: adminLoginBody() });
  expect(r.status).toBe(200);
  adminCookie = r.cookie!;
}, 30000);

describe('reconciliation', () => {
  it('is admin-only', async () => {
    const r = await api('/api/admin/reconciliation');
    expect(r.status).toBe(401);
    const ok = await api('/api/admin/reconciliation', { cookie: adminCookie });
    expect(ok.status).toBe(200);
  });

  it('says so plainly when there is nothing to reconcile against', async () => {
    // The test worker runs with PAYSTACK_MOCK=1, so there is no Paystack.
    const r = await api('/api/admin/reconciliation', { cookie: adminCookie });
    expect(r.status).toBe(200);
    const rec = r.json.reconciliation;
    expect(rec.available).toBe(false);
    expect(rec.reason).toMatch(/mock mode/i);
    expect(rec.discrepancies).toEqual([]);
  });

  it('exports a CSV with a header even when empty', async () => {
    const r = await api('/api/admin/reconciliation?format=csv', { cookie: adminCookie });
    expect(r.status).toBe(200);
    expect(String(r.text ?? '')).toContain('"kind","reference","local_ngn"');
  });
});

/**
 * The four ways two ledgers can disagree, exercised against a fake Paystack.
 * These are pure-logic tests: `reconcilePayments` takes a fetcher, so no
 * network is involved and no real money is described.
 */
describe('reconciliation logic (stubbed Paystack)', () => {
  it('catches all four disagreement shapes', async () => {
    const { reconcilePayments } = await import('../lib/reconcile');
    // A minimal Env whose DB answers the two queries reconcilePayments runs.
    const today = new Date().toISOString().slice(0, 10);
    const payments = [
      // Approved locally, and Paystack agrees: no discrepancy.
      { id: 1, reference: 'REF-OK', paystack_reference: 'PS-OK', amount: 500000, status: 'approved', method: 'paystack', business_id: 1, created_at: `${today}T10:00:00.000Z` },
      // Approved locally, no money at Paystack: the dangerous one.
      { id: 2, reference: 'REF-GONE', paystack_reference: 'PS-GONE', amount: 250000, status: 'approved', method: 'paystack', business_id: 2, created_at: `${today}T11:00:00.000Z` },
      // Approved for more than Paystack settled.
      { id: 3, reference: 'REF-LESS', paystack_reference: 'PS-LESS', amount: 300000, status: 'approved', method: 'paystack', business_id: 3, created_at: `${today}T12:00:00.000Z` },
      // We say approved, Paystack says the charge failed.
      { id: 4, reference: 'REF-FAIL', paystack_reference: 'PS-FAIL', amount: 100000, status: 'approved', method: 'paystack', business_id: 4, created_at: `${today}T13:00:00.000Z` },
      // Bank transfer: never a Paystack transaction, so never a discrepancy.
      { id: 5, reference: 'REF-BANK', paystack_reference: null, amount: 750000, status: 'approved', method: 'bank_transfer', business_id: 5, created_at: `${today}T14:00:00.000Z` },
    ];
    const txns = [
      { reference: 'PS-OK', amount: 500000, status: 'success', paid_at: `${today}T10:00:00.000Z` },
      { reference: 'PS-LESS', amount: 295000, status: 'success', paid_at: `${today}T12:00:00.000Z` },
      { reference: 'PS-FAIL', amount: 100000, status: 'failed', paid_at: `${today}T13:00:00.000Z` },
      // Money that arrived with no payment row claiming it — a lost webhook.
      { reference: 'PS-ORPHAN', amount: 99000, status: 'success', paid_at: `${today}T15:00:00.000Z` },
    ];

    const env = {
      PAYSTACK_MOCK: '0',
      PAYSTACK_SECRET_KEY: 'sk_test_stub',
      DB: {
        prepare(sql: string) {
          return {
            bind(...args: unknown[]) {
              void args;
              return {
                async all() {
                  return {
                    results: sql.includes('FROM payments') ? payments : [],
                  };
                },
              };
            },
          };
        },
      },
    } as never;

    const fetcher = (async () => ({
      ok: true,
      async json() {
        return { data: txns, meta: { total: txns.length, per_page: 100 } };
      },
    })) as never;

    const r = await reconcilePayments(env, { from: today, to: today, fetcher });

    expect(r.available).toBe(true);
    expect(r.checked).toBe(4); // four Paystack-method payments
    expect(r.matched).toBe(1); // only REF-OK agrees
    expect(r.paystack_count).toBe(4);

    const kinds = r.discrepancies.map((d) => `${d.kind}:${d.reference}`).sort();
    expect(kinds).toEqual([
      'amount_mismatch:PS-LESS',
      'missing_locally:PS-ORPHAN',
      'missing_on_paystack:PS-GONE',
      'status_mismatch:PS-FAIL',
    ]);

    const gone = r.discrepancies.find((d) => d.reference === 'PS-GONE')!;
    expect(gone.note).toMatch(/never arrived|reference was lost/i);
    const orphan = r.discrepancies.find((d) => d.reference === 'PS-ORPHAN')!;
    expect(orphan.note).toMatch(/webhook/i);

    // Only successful Paystack transactions count towards settled money, and
    // only Paystack payments count towards recorded money — bank transfers are
    // approved by a human against a bank statement, so putting them on either
    // side would make the "difference" figure meaningless.
    expect(r.totals.paystack_success_kobo).toBe(500000 + 295000 + 99000);
    expect(r.totals.local_approved_kobo).toBe(500000 + 250000 + 300000 + 100000);
  });

  it('escapes CSV cells so a note cannot become a spreadsheet formula', async () => {
    const { reconciliationCsv } = await import('../lib/reconcile');
    const csv = reconciliationCsv({
      ok: true,
      available: true,
      from: '2026-01-01',
      to: '2026-01-02',
      checked: 1,
      matched: 0,
      paystack_count: 1,
      discrepancies: [
        {
          kind: 'amount_mismatch',
          reference: '=cmd|calc',
          local_amount_kobo: 100000,
          paystack_amount_kobo: 90000,
          local_status: 'approved',
          paystack_status: 'success',
          payment_id: 7,
          business_id: 1,
          created_at: '2026-01-01T10:00:00Z',
          note: 'Says "hello", -2 naira out',
        },
      ],
      totals: { local_approved_kobo: 100000, paystack_success_kobo: 90000 },
    });
    expect(csv).toContain('"\'=cmd|calc"');
    // Quotes are doubled; the leading "-" of the note is not treated as a
    // formula because it is not the first character of the cell.
    expect(csv).toContain('"Says ""hello"", -2 naira out"');
    // Kobo in, naira out — the screen must not make admins divide by 100.
    expect(csv).toContain('"1000.00","900.00"');
  });
});
