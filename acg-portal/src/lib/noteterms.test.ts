import { describe, it, expect } from 'vitest';
import { computeDistributionDollars, addMonthsISO, formatISOToLong } from './noteterms';

describe('computeDistributionDollars', () => {
  it('is principal × rate ÷ 12 (matches $250k @ 18% → 3,750)', () => {
    expect(computeDistributionDollars('250,000', '18')).toBe('3,750');
  });
  it('tolerates $ and commas in the inputs', () => {
    expect(computeDistributionDollars('$600,000', '15%')).toBe('7,500');
  });
  it('returns empty for missing or invalid inputs', () => {
    expect(computeDistributionDollars('', '18')).toBe('');
    expect(computeDistributionDollars('250000', '')).toBe('');
    expect(computeDistributionDollars('abc', 'x')).toBe('');
  });
});

describe('addMonthsISO', () => {
  it('adds the term to the wire-received date', () => {
    expect(addMonthsISO('2026-06-01', 24)).toBe('2028-06-01');
    expect(addMonthsISO('2025-04-14', 24)).toBe('2027-04-14');
    expect(addMonthsISO('2026-01-15', 18)).toBe('2027-07-15');
  });
  it('clamps to the target month length', () => {
    expect(addMonthsISO('2026-08-31', 6)).toBe('2027-02-28');
  });
  it('returns empty for blank/invalid input', () => {
    expect(addMonthsISO('', 24)).toBe('');
    expect(addMonthsISO('not-a-date', 24)).toBe('');
  });
});

describe('formatISOToLong', () => {
  it('renders a long human date', () => {
    expect(formatISOToLong('2028-02-01')).toBe('February 1, 2028');
  });
  it('returns empty for blank input', () => {
    expect(formatISOToLong('')).toBe('');
  });
});
