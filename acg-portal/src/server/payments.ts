import 'server-only';
import { z } from 'zod';
import { parseISODate, toISODate } from '@/lib/dates';
import { HttpError } from '@/lib/http';
import { db } from '@/server/db/client';
import { newId, type D1Database } from '@/server/db/d1';
import { getNoteWithDistributions, investorExists } from '@/server/db/repo';
import { paymentEmailStatement } from '@/server/email/outbox';

export interface ScheduledPayment {
  id: string;
  index: number;
  amountCents: number;
  dueDate: string;
  paidDate: string | null;
  reference: string | null;
}

export interface PaymentSchedule {
  distributions: ScheduledPayment[];
  paidTotalCents: number;
}

export async function getPaymentSchedule(investorId: string, database: D1Database = db()): Promise<PaymentSchedule> {
  const note = await getNoteWithDistributions(database, investorId);
  if (!note && !(await investorExists(database, investorId))) throw new HttpError(404, 'Investor not found.');
  const distributions = (note?.distributions ?? []).map((d) => ({
    id: d.id,
    index: d.index,
    amountCents: d.amountCents,
    dueDate: toISODate(d.dueDate),
    paidDate: d.paidDate ? toISODate(d.paidDate) : null,
    reference: d.reference,
  }));
  return {
    distributions,
    paidTotalCents: distributions.reduce((sum, d) => sum + (d.paidDate ? d.amountCents : 0), 0),
  };
}

const paymentInput = z.object({
  distributionId: z.string().min(1).max(100),
  paidDate: z.string().date('Enter a valid payment date.'),
  reference: z.string().trim().min(1, 'Enter a payment reference.').max(120, 'Use a reference of 120 characters or fewer.'),
}).strict();

export async function recordDistributionPayment(
  investorId: string,
  input: unknown,
  actorUserId: string,
  ip: string | null,
  database: D1Database = db(),
  now = Date.now(),
): Promise<{ recorded: boolean }> {
  const parsed = paymentInput.safeParse(input);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid payment details.');
  const { distributionId, paidDate, reference } = parsed.data;
  const day = parseISODate(paidDate);
  if (!day || toISODate(day) !== paidDate || day.getTime() > now) {
    throw new HttpError(400, 'Choose a valid payment date on or before today.');
  }

  const auditId = newId();
  const scope = 'id = ? AND note_id = (SELECT id FROM notes WHERE investor_id = ?)';
  const [updated] = await database.batch([
    database.prepare(`UPDATE distributions SET paid_date = ?, reference = ? WHERE ${scope} AND paid_date IS NULL`)
      .bind(day.getTime(), reference, distributionId, investorId),
    // Derive the amount and ordinal from the distribution that actually changed.
    // A retry, conflicting post or stale selection writes neither audit nor email.
    database.prepare(
      `INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, metadata, ip, created_at)
       SELECT ?, ?, 'DISTRIBUTION_PAID', 'Distribution', id,
              json_object('investorId', ?, 'amountCents', amount_cents, 'distributionIndex', idx,
                          'paidDate', ?, 'reference', reference), ?, ?
       FROM distributions WHERE id = ? AND changes() = 1`,
    ).bind(auditId, actorUserId, investorId, paidDate, ip, now, distributionId),
    paymentEmailStatement(database, distributionId, auditId, now),
  ]);
  if (updated?.meta.changes === 1) return { recorded: true };

  const existing = await database.prepare(`SELECT paid_date, reference FROM distributions WHERE ${scope}`)
    .bind(distributionId, investorId).first<{ paid_date: number | null; reference: string | null }>();
  if (!existing) throw new HttpError(404, 'This distribution is no longer on this investor’s schedule.');
  if (existing.paid_date === day.getTime() && existing.reference === reference) return { recorded: false };
  throw new HttpError(409, 'This distribution already has a recorded payment.');
}
