import { describe, it, expect } from 'vitest';
import {
  generateSchedule,
  computeMaturity,
  deriveStatuses,
  distributionReference,
  termProgress,
} from './schedule';
import { utcDate, formatDate } from './dates';

describe('generateSchedule', () => {
  const wire = utcDate(2025, 3, 14); // Apr 14, 2025
  const schedule = generateSchedule(wire, 24, 1, 375_000);

  it('produces one distribution per term month', () => {
    expect(schedule).toHaveLength(24);
  });
  it('first distribution is the 1st of the month after the wire', () => {
    expect(formatDate(schedule[0]!.dueDate)).toBe('May 1, 2025');
  });
  it('last distribution is 23 months after the first', () => {
    expect(formatDate(schedule[23]!.dueDate)).toBe('Apr 1, 2027');
  });
  it('carries the monthly amount', () => {
    expect(schedule.every((d) => d.amountCents === 375_000)).toBe(true);
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
