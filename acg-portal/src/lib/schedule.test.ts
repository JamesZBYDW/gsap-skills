import { describe, it, expect } from 'vitest';
import {
  generateScheduleBetween,
  computeMaturity,
  deriveStatuses,
  distributionReference,
  termProgress,
} from './schedule';
import { utcDate, formatDate, addDays } from './dates';

describe('generateScheduleBetween (30-day cadence; final distribution returns principal)', () => {
  it('runs every 30 days from the first distribution up to maturity', () => {
    // First Aug 1, 2026; each subsequent +30 days; maturity Nov 1, 2026.
    const s = generateScheduleBetween(utcDate(2026, 7, 1), 375_000, utcDate(2026, 10, 1));
    expect(s.map((d) => formatDate(d.dueDate))).toEqual([
      'Aug 1, 2026', 'Aug 31, 2026', 'Sep 30, 2026', 'Oct 30, 2026',
    ]);
    expect(s.every((d) => d.amountCents === 375_000)).toBe(true);
  });
  it('adds the principal to the FINAL distribution (note expires after it)', () => {
    const s = generateScheduleBetween(utcDate(2026, 7, 1), 375_000, utcDate(2026, 10, 1), 25_000_000);
    expect(s.slice(0, -1).every((d) => d.amountCents === 375_000)).toBe(true);
    expect(s[s.length - 1]!.amountCents).toBe(25_375_000);
  });
  it('includes a distribution that lands exactly on maturity', () => {
    // 60 days after Aug 1 is Sep 30; maturity Sep 30 is included.
    const s = generateScheduleBetween(utcDate(2026, 7, 1), 1000, utcDate(2026, 8, 30));
    expect(s).toHaveLength(3);
    expect(formatDate(s[2]!.dueDate)).toBe('Sep 30, 2026');
  });
  it('returns nothing without a maturity date or when maturity precedes the start', () => {
    expect(generateScheduleBetween(utcDate(2026, 7, 1), 1000, null)).toEqual([]);
    expect(generateScheduleBetween(utcDate(2026, 7, 1), 1000, utcDate(2026, 6, 1))).toEqual([]);
  });
  it('reproduces the demo note: wire Apr 14 2025 + 24 months → 24 distributions, 14 paid by Jun 30 2026', () => {
    const wire = utcDate(2025, 3, 14);
    const first = addDays(wire, 30);
    const s = generateScheduleBetween(first, 375_000, computeMaturity(wire, 24), 25_000_000);
    expect(formatDate(first)).toBe('May 14, 2025');
    expect(s).toHaveLength(24);
    const asOf = utcDate(2026, 5, 30);
    expect(s.filter((d) => d.dueDate <= asOf)).toHaveLength(14);
    expect(s[23]!.amountCents).toBe(25_375_000);
  });
});

describe('computeMaturity', () => {
  it('matures on the term anniversary of the wire (Apr 14, 2027)', () => {
    expect(formatDate(computeMaturity(utcDate(2025, 3, 14), 24))).toBe('Apr 14, 2027');
  });
});

describe('deriveStatuses', () => {
  it('marks paid, the first unpaid as next, the rest upcoming', () => {
    const dists = Array.from({ length: 24 }, (_, i) => ({
      index: i + 1,
      paidDate: i < 14 ? new Date() : null,
    }));
    const statuses = deriveStatuses(dists);
    expect(statuses.get(1)).toBe('PAID');
    expect(statuses.get(14)).toBe('PAID');
    expect(statuses.get(15)).toBe('NEXT');
    expect(statuses.get(16)).toBe('UPCOMING');
    expect(statuses.get(24)).toBe('UPCOMING');
  });
});

describe('distributionReference', () => {
  it('matches the prototype ACH reference scheme', () => {
    expect(distributionReference(1)).toBe('ACH·2407');
    expect(distributionReference(14)).toBe('ACH·2498');
  });
});

describe('termProgress', () => {
  it('14 of 24 ≈ 58%', () => {
    expect(Math.round(termProgress(14, 24) * 100)).toBe(58);
  });
  it('clamps to [0,1]', () => {
    expect(termProgress(30, 24)).toBe(1);
    expect(termProgress(-5, 24)).toBe(0);
  });
});
