import { describe, expect, it } from 'vitest';
import { api, setupIntegration } from './harness';

// Upgrade real local D1 with existing data, not just a clean-schema install.
setupIntegration({ main: 'src/tests/fixtures/operations-worker.ts', beforeMigration: {
  filename: '0017_atomic_credit_holds.sql',
  sql: `INSERT INTO users(id,name,email,password_hash,referral_credit_kobo) VALUES(90000,'Legacy Vendor','legacy@test.ng','synthetic-not-a-login',100000);
    INSERT INTO businesses(id,owner_user_id,name,slug,status) VALUES(90000,90000,'Legacy Shop','legacy-shop','active');
    INSERT INTO payments(id,business_id,reference,plan_id,amount,method,status,metadata) VALUES
      (90001,90000,'LEGACY-PENDING',(SELECT id FROM plans WHERE slug='starter'),1200000,'bank_transfer','pending','{"gross":1500000,"credit_kobo":300000}'),
      (90002,90000,'LEGACY-CREDIT',(SELECT id FROM plans WHERE slug='starter'),1500000,'manual','approved','{"gross":1500000,"credit_kobo":1500000}'),
      (90003,90000,'LEGACY-FAILED',(SELECT id FROM plans WHERE slug='starter'),1200000,'bank_transfer','failed','{"gross":1500000,"credit_kobo":300000}'),
      (90004,90000,'LEGACY-BADJSON',(SELECT id FROM plans WHERE slug='starter'),500000,'bank_transfer','pending','{'),
      (90005,90000,'LEGACY-STRING',(SELECT id FROM plans WHERE slug='starter'),500000,'bank_transfer','pending','{"credit_kobo":"300000"}');`,
} });
const call = async (path: string, body: unknown) => {
  const response = await api(`/__test/${path}`, { method: 'POST', body });
  expect(response.status, response.text).toBe(200); return response.json;
};
const state = (id: number) => call('payment-state', { id });
const balance = async () => (await call('credit-info', { userId: 90000, businessId: 90000 })).user.referral_credit_kobo;

describe('atomic credit migration with synthetic historical D1 rows', () => {
  it('backfills holds without debiting balances, replaying approvals or minting terminal credit', async () => {
    expect(await balance()).toBe(100_000);
    const pending = await state(90001);
    expect(pending.credit.gross_kobo).toBe(1_500_000);
    expect(pending.credit.amount_kobo).toBe(300_000);
    expect(pending.credit.returned_at).toBeNull();
    const approved = await state(90002);
    expect(approved.credit.amount_kobo).toBe(1_500_000);
    expect(approved.activation).toBeNull();
    expect(approved.subscription).toBeNull();
    expect(approved.notices.n).toBe(0);
    expect((await state(90003)).credit.returned_at).toBeTruthy();
    await call('payment-terminal', { id: 90003 });
    expect(await balance()).toBe(100_000);
  });
  it('returns a backfilled pending hold once without inferring historical corrections', async () => {
    await Promise.all([call('payment-terminal', { id: 90001 }),call('payment-terminal', { id: 90001 })]);
    expect(await balance()).toBe(400_000);
    expect((await state(90001)).credit.returned_at).toBeTruthy();
  });
  it('treats malformed metadata and string-valued credit as zero, not minted credit', async () => {
    for (const id of [90004,90005]) {
      const legacy = await state(id);
      expect(legacy.credit.gross_kobo).toBe(500_000);
      expect(legacy.credit.amount_kobo).toBe(0);
      await call('payment-terminal', { id });
    }
    expect(await balance()).toBe(400_000);
  });
});
