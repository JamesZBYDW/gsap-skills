import { describe, it, expect } from 'vitest';
import {
  formatUSD,
  formatCompactUSD,
  formatRate,
  formatRatePrecise,
  parseMoneyToCents,
  monthlyDistributionCents,
} from './money';

describe('formatUSD', () => {
  it('formats whole dollars without decimals', () => {
    expect(formatUSD(25_000_000)).toBe('$250,000');
    expect(formatUSD(375_000)).toBe('$3,750');
    expect(formatUSD(0)).toBe('$0');
  });
  it('shows cents when present', () => {
    expect(formatUSD(123_456)).toBe('$1,234.56');
  });
});

describe('formatCompactUSD', () => {
  it('compacts millions and thousands', () => {
    expect(formatCompactUSD(4_250_000_00)).toBe('$4.25M');
    expect(formatCompactUSD(612_000_00)).toBe('$612K');
    expect(formatCompactUSD(2_800_000_00)).toBe('$2.8M');
  });
});

describe('rates', () => {
  it('formats basis points', () => {
    expect(formatRate(1800)).toBe('18%');
    expect(formatRate(2000)).toBe('20%');
    expect(formatRatePrecise(1800)).toBe('18.0%');
  });
});

describe('parseMoneyToCents', () => {
  it('parses common formats', () => {
    expect(parseMoneyToCents('250,000')).toBe(25_000_000);
    expect(parseMoneyToCents('$250,000')).toBe(25_000_000);
    expect(parseMoneyToCents('1000000')).toBe(100_000_000);
    expect(parseMoneyToCents('100.50')).toBe(10_050);
  });
  it('rejects invalid input', () => {
    expect(parseMoneyToCents('')).toBeNull();
    expect(parseMoneyToCents('abc')).toBeNull();
    expect(parseMoneyToCents('-5')).toBeNull();
    expect(parseMoneyToCents('0')).toBeNull();
  });
});

describe('monthlyDistributionCents', () => {
  it('matches the prototype: $250k @ 18% -> $3,750/mo', () => {
    expect(monthlyDistributionCents(25_000_000, 1800)).toBe(375_000);
  });
  it('computes $1.2M @ 18% -> $18,000/mo', () => {
    expect(monthlyDistributionCents(120_000_000, 1800)).toBe(1_800_000);
  });
});
