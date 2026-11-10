import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { freshD1 } from './support/d1';
import { createAccountSchema, noteTermsSchema } from '@/lib/validation';
import { formatCompactUSD, formatUSD } from '@/lib/money';
import { getOverview } from '@/server/portal';
import { getTeamOverview } from '@/server/team';
import type { D1Database } from '@/server/db/d1';
import { createInvestorAccount, setNoteTerms, setNotifPref } from '@/server/lifecycle';
import { getPaymentSchedule, recordDistributionPayment } from '@/server/payments';

let database: D1Database;
let dispose: () => Promise<void>;
vi.mock('@/server/db/client', () => ({ db: () => database }));
beforeAll(async () => { ({ db: database, dispose } = await freshD1()); });
afterAll(async () => dispose?.());

const actor = 'team-operator';
const paidDate = '2025-01-15';
const reference = 'ACH-0149';
const newTerms = noteTermsSchema.parse({ principal: '200,000', ratePercent: 15, termMonths: 18, wireReceivedDate: '2024-01-01' });
const sameTerms = noteTermsSchema.parse({ principal: '100,000', ratePercent: 12, termMonths: 12, wireReceivedDate: '2024-01-01' });

async function account() {
  const email = `investor-${crypto.randomUUID()}@example.test`;
  const { id } = await createInvestorAccount(createAccountSchema.parse({
    name: 'Test Investor', email, password: 'Synthetic2026',
    principal: '100,000', ratePercent: 12, termMonths: 12, wireReceivedDate: '2024-01-01',
  }), actor, null, database);
  const { distributions } = await getPaymentSchedule(id, database);
  return { investorId: id, email, first: distributions[0]!, last: distributions.at(-1)! };
}

const post = (investor: string, distribution: string, ref = reference) =>
  recordDistributionPayment(investor, { distributionId: distribution, paidDate, reference: ref }, actor, null, database);
const audits = async (id: string) =>
  (await database.prepare("SELECT * FROM audit_logs WHERE target_id = ? AND action = 'DISTRIBUTION_PAID'").bind(id).all()).results;
const emails = async (id: string) =>
  (await database.prepare("SELECT recipient, state FROM email_outbox WHERE kind = 'payment' AND source_id = ?").bind(id).all()).results;

describe('record a scheduled distribution', () => {
  it('posts the scheduled amount, including final principal, to the investor and team dashboards', async () => {
    const a = await account();
    expect(a.first.amountCents).toBe(100_000);
    expect(a.last.amountCents).toBe(10_100_000);
    await post(a.investorId, a.first.id);
    await post(a.investorId, a.last.id, 'WIRE-0237');
    const payments = await getPaymentSchedule(a.investorId);
    expect(payments.paidTotalCents).toBe(10_200_000);
    const overview = await getOverview(a.investorId);
    expect(overview.distributed.amount).toBe(formatUSD(10_200_000));
    expect(overview.ledger.at(-1)).toMatchObject({ paidDate: 'Jan 15, 2025', status: 'PAID', ref: 'WIRE-0237' });
    expect(overview.next?.arrival).toBe('Past due');
    expect((await getTeamOverview()).distributed).toBe(formatCompactUSD(10_200_000));
    const log = await audits(a.last.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actor_user_id: actor, target_type: 'Distribution' });
    expect(JSON.parse(String(log[0]!.metadata))).toEqual({
      investorId: a.investorId, amountCents: a.last.amountCents, distributionIndex: a.last.index, paidDate, reference: 'WIRE-0237',
    });
    expect(await emails(a.last.id)).toEqual([{ recipient: a.email, state: 'pending' }]);
  });

  it('handles concurrent retries once and rejects attempts to replace posted details', async () => {
    const a = await account();
    const results = await Promise.all([post(a.investorId, a.first.id), post(a.investorId, a.first.id)]);
    expect(results.map((r) => r.recorded).sort()).toEqual([false, true]);
    await expect(post(a.investorId, a.first.id, 'different')).rejects.toMatchObject({ status: 409 });
    expect(await audits(a.first.id)).toHaveLength(1);
    expect(await emails(a.first.id)).toHaveLength(1);
    expect((await getPaymentSchedule(a.investorId)).distributions[0]).toMatchObject({ paidDate, reference });
  });

  it('requires the distribution to belong to the specified investor and honors the email preference', async () => {
    const a = await account();
    const b = await account();
    await expect(post(a.investorId, b.first.id)).rejects.toMatchObject({ status: 404 });
    expect(await audits(b.first.id)).toHaveLength(0);
    expect((await getPaymentSchedule(b.investorId)).paidTotalCents).toBe(0);
    await setNotifPref(a.investorId, 'distributionPosted', false, actor, null);
    await post(a.investorId, a.first.id);
    expect(await audits(a.first.id)).toHaveLength(1);
    expect(await emails(a.first.id)).toHaveLength(0);
  });

  it('rejects invalid dates, missing references, and an amount supplied by the browser', async () => {
    const a = await account();
    for (const override of [{ paidDate: '2025-02-30' }, { paidDate: '9999-01-01' }, { reference: '   ' }, { amountCents: 1 }]) {
      const input = { distributionId: a.first.id, reference, paidDate, ...override };
      await expect(recordDistributionPayment(a.investorId, input, actor, null)).rejects.toMatchObject({ status: 400 });
    }
    expect((await getPaymentSchedule(a.investorId)).paidTotalCents).toBe(0);
  });

  it('rolls back the audit and payment together if queueing the notification fails', async () => {
    const a = await account();
    await database.prepare(`CREATE TRIGGER payment_test_outbox_error BEFORE INSERT ON email_outbox
      WHEN NEW.kind='payment' BEGIN SELECT RAISE(ABORT, 'test queue failure'); END`).run();
    try {
      await expect(post(a.investorId, a.first.id)).rejects.toThrow(/test queue failure/);
      expect((await getPaymentSchedule(a.investorId)).paidTotalCents).toBe(0);
      expect(await audits(a.first.id)).toHaveLength(0);
    } finally {
      await database.prepare('DROP TRIGGER payment_test_outbox_error').run();
    }
  });

  it('extends future terms while preserving non-contiguous posted rows, their audit records and queued emails', async () => {
    const a = await account();
    const initial = (await getPaymentSchedule(a.investorId)).distributions;
    const postedIds = [initial[0]!.id, initial[3]!.id];
    for (const id of postedIds) await post(a.investorId, id);
    const before = await getPaymentSchedule(a.investorId);
    const history = async () => Promise.all(postedIds.map(async (id) => ({
      audit: await audits(id),
      email: (await database.prepare("SELECT * FROM email_outbox WHERE kind = 'payment' AND source_id = ?").bind(id).all()).results,
    })));
    const recordedHistory = await history();
    await setNoteTerms(a.investorId, { ...sameTerms, termMonths: 18 }, actor, null);
    const after = await getPaymentSchedule(a.investorId);
    expect(after.distributions.length).toBeGreaterThan(initial.length);
    expect(after.distributions.filter((d) => d.paidDate)).toEqual(before.distributions.filter((d) => d.paidDate));
    expect(after.paidTotalCents).toBe(before.paidTotalCents);
    expect(await history()).toEqual(recordedHistory);
    // Its former final (unpaid) slot now contains interest only. The principal
    // moves to the new final slot, and the old unpaid selection is stale.
    expect(after.distributions[a.last.index - 1]!.amountCents).toBe(a.first.amountCents);
    expect(after.distributions.at(-1)!.amountCents).toBe(a.last.amountCents);
    await expect(post(a.investorId, a.last.id)).rejects.toMatchObject({ status: 404 });
  });

  it('rolls back changes to a posted amount, due date or slot, including a paid return of principal', async () => {
    const a = await account();
    await post(a.investorId, a.last.id);
    const before = await getPaymentSchedule(a.investorId);
    const countAudits = async () => database.prepare('SELECT count(*) AS n FROM audit_logs').first();
    const initialCount = await countAudits();
    for (const conflict of [
      newTerms,
      { ...sameTerms, wireReceivedDate: '2024-01-02' },
      { ...sameTerms, wireReceivedDate: null },
      { ...sameTerms, termMonths: 18 }, // old final would lose the posted principal
    ]) {
      await expect(setNoteTerms(a.investorId, conflict, actor, null)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('recorded distribution') });
      expect(await getPaymentSchedule(a.investorId)).toEqual(before);
    }
    expect(await countAudits()).toEqual(initialCount);
    expect((await getOverview(a.investorId)).principal).toBe('$100,000');
    await setNoteTerms(a.investorId, sameTerms, actor, null);
    expect((await getPaymentSchedule(a.investorId)).distributions.at(-1)).toEqual(before.distributions.at(-1));
  });

  it('rejects stale selections after an unpaid schedule is replaced', async () => {
    const b = await account();
    await setNoteTerms(b.investorId, newTerms, actor, null);
    await expect(post(b.investorId, b.first.id)).rejects.toMatchObject({ status: 404 });
    expect((await getPaymentSchedule(b.investorId)).paidTotalCents).toBe(0);
  });

  it('serializes a concurrent payment against a conflicting note edit', async () => {
    const a = await account();
    const [payment, edit] = await Promise.allSettled([
      post(a.investorId, a.first.id),
      setNoteTerms(a.investorId, newTerms, actor, null),
    ]);
    const after = await getPaymentSchedule(a.investorId);
    if (payment.status === 'fulfilled') {
      expect(edit).toMatchObject({ status: 'rejected', reason: { status: 409 } });
      expect(after.distributions[0]).toEqual({ ...a.first, paidDate, reference });
      expect(await audits(a.first.id)).toHaveLength(1);
      expect(await emails(a.first.id)).toHaveLength(1);
    } else {
      expect(payment.reason).toMatchObject({ status: 404 });
      expect(edit.status).toBe('fulfilled');
      expect(after.paidTotalCents).toBe(0);
      expect(after.distributions[0]!.amountCents).toBe(250_000);
      expect(await audits(a.first.id)).toHaveLength(0);
      expect(await emails(a.first.id)).toHaveLength(0);
    }
  });
});
