import { addMonths, addDays, firstDistributionAfter } from './dates';

/** Days between recurring distributions (each one 30 days after the previous). */
export const DISTRIBUTION_INTERVAL_DAYS = 30;

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

/**
 * Generate the full distribution schedule for a note. Distributions fall on
 * `distributionDay` of each month, starting the month after the wire.
 */
export function generateSchedule(
  wireDate: Date,
  termMonths: number,
  distributionDay: number,
  monthlyAmountCents: number,
): GeneratedDistribution[] {
  const first = firstDistributionAfter(wireDate, distributionDay);
  const baseYear = first.getUTCFullYear();
  const baseMonth = first.getUTCMonth();
  const out: GeneratedDistribution[] = [];
  for (let i = 0; i < termMonths; i++) {
    // Anchor each occurrence on `distributionDay`, clamped to that month's
    // length — so a short first month (e.g. Feb) never drifts later months.
    const monthStart = new Date(Date.UTC(baseYear, baseMonth + i, 1));
    const lastDay = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
    monthStart.setUTCDate(Math.min(distributionDay, lastDay));
    out.push({ index: i + 1, dueDate: monthStart, amountCents: monthlyAmountCents });
  }
  return out;
}

/** A standard ACH reference for a posted distribution (e.g. "ACH·2407"). */
export function distributionReference(index: number): string {
  return `ACH·${2400 + index * 7}`;
}

/**
 * Generate a schedule from an explicit management-entered first distribution
 * date through a maturity date: the first payment lands on `start` exactly, and
 * each subsequent payment falls 30 days after the previous one, up to and
 * including `maturity`. Returns [] if either date is missing or `maturity`
 * precedes `start`.
 */
export function generateScheduleBetween(
  start: Date,
  amountCents: number,
  maturity: Date | null,
): GeneratedDistribution[] {
  if (!maturity || maturity < start) return [];
  const out: GeneratedDistribution[] = [];
  for (let i = 0; i < 600; i++) {
    const due = addDays(start, i * DISTRIBUTION_INTERVAL_DAYS);
    if (due > maturity) break;
    out.push({ index: i + 1, dueDate: due, amountCents });
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
