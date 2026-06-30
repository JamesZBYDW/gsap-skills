import { addMonths, firstDistributionAfter } from './dates';

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
  const out: GeneratedDistribution[] = [];
  for (let i = 0; i < termMonths; i++) {
    out.push({
      index: i + 1,
      dueDate: addMonths(first, i),
      amountCents: monthlyAmountCents,
    });
  }
  return out;
}

/** A standard ACH reference for a posted distribution (e.g. "ACH·2407"). */
export function distributionReference(index: number): string {
  return `ACH·${2400 + index * 7}`;
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
