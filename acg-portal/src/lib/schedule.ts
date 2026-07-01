import { addMonths, addDays } from './dates';

/** Days between recurring distributions (each one 30 days after the previous). */
export const DISTRIBUTION_INTERVAL_DAYS = 30;

/** Days before maturity at which the expiry notice window opens. */
export const MATURITY_NOTICE_DAYS = 90;

export type DistributionDisplayStatus = 'PAID' | 'NEXT' | 'UPCOMING';

export interface GeneratedDistribution {
  index: number; // 1-based
  dueDate: Date;
  amountCents: number;
}

/** Maturity is the term anniversary of the wire date. */
export function computeMaturity(wireDate: Date, termMonths: number): Date {
  return addMonths(wireDate, termMonths);
}

/** A standard ACH reference for a posted distribution (e.g. "ACH·2407"). */
export function distributionReference(index: number): string {
  return `ACH·${2400 + index * 7}`;
}

/**
 * Generate a schedule from the first distribution date through maturity: the
 * first payment lands on `start` exactly, each subsequent payment falls 30 days
 * after the previous one, up to and including `maturity`. The FINAL distribution
 * also returns the principal (`principalCents` is added to its amount) — the
 * note expires after that last, principal-bearing distribution. Returns [] if
 * either date is missing or `maturity` precedes `start`.
 */
export function generateScheduleBetween(
  start: Date,
  amountCents: number,
  maturity: Date | null,
  principalCents = 0,
): GeneratedDistribution[] {
  if (!maturity || maturity < start) return [];
  const out: GeneratedDistribution[] = [];
  for (let i = 0; i < 600; i++) {
    const due = addDays(start, i * DISTRIBUTION_INTERVAL_DAYS);
    if (due > maturity) break;
    out.push({ index: i + 1, dueDate: due, amountCents });
  }
  if (out.length > 0 && principalCents > 0) {
    out[out.length - 1]!.amountCents += principalCents;
  }
  return out;
}

export interface DistributionLike {
  index: number;
  paidDate: Date | null;
}

/**
 * Derive display status for an ordered list of distributions: anything with a
 * recorded payment is PAID; the earliest unpaid is NEXT; the rest UPCOMING.
 */
export function deriveStatuses(
  distributions: DistributionLike[],
): Map<number, DistributionDisplayStatus> {
  const ordered = [...distributions].sort((a, b) => a.index - b.index);
  const result = new Map<number, DistributionDisplayStatus>();
  let nextAssigned = false;
  for (const d of ordered) {
    if (d.paidDate) {
      result.set(d.index, 'PAID');
    } else if (!nextAssigned) {
      result.set(d.index, 'NEXT');
      nextAssigned = true;
    } else {
      result.set(d.index, 'UPCOMING');
    }
  }
  return result;
}

/** Maturity progress as a fraction in [0,1] from paid count over term. */
export function termProgress(paidCount: number, termMonths: number): number {
  if (termMonths <= 0) return 0;
  return Math.min(1, Math.max(0, paidCount / termMonths));
}
