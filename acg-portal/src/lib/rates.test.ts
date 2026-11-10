import { describe, it, expect } from 'vitest';
import { deriveRateBps, isSupportedTerm, parseTermMonths, TERM_OPTIONS, MIN_PRINCIPAL_CENTS } from './rates';

describe('rate structure', () => {
  it('maps the published term→rate table', () => {
    expect(deriveRateBps(12)).toBe(1200);
    expect(deriveRateBps(18)).toBe(1500);
    expect(deriveRateBps(24)).toBe(1800);
    expect(deriveRateBps(36)).toBe(2000);
  });
  it('defaults unknown terms to 18%', () => {
    expect(deriveRateBps(99)).toBe(1800);
  });
  it('flags supported terms', () => {
    expect(isSupportedTerm(24)).toBe(true);
    expect(isSupportedTerm(13)).toBe(false);
  });
  it('exposes four term options', () => {
    expect(TERM_OPTIONS.map((t) => t.months)).toEqual([12, 18, 24, 36]);
  });
  it('minimum investment is $100,000', () => {
    expect(MIN_PRINCIPAL_CENTS).toBe(10_000_000);
  });
});

describe('parseTermMonths', () => {
  it('extracts months from free text', () => {
    expect(parseTermMonths('24 months')).toBe(24);
    expect(parseTermMonths('24mo')).toBe(24);
    expect(parseTermMonths('36')).toBe(36);
    expect(parseTermMonths('none')).toBeNull();
  });
});
