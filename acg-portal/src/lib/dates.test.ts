import { describe, it, expect } from 'vitest';
import {
  utcDate,
  formatDate,
  formatMonthYear,
  addMonths,
  addDays,
  daysBetween,
  arrivalLabel,
  inDaysLabel,
  wholeMonthsUntil,
  monthsRemainingLabel,
} from './dates';

describe('formatDate', () => {
  it('formats as "Mon D, YYYY"', () => {
    expect(formatDate(utcDate(2027, 3, 14))).toBe('Apr 14, 2027');
    expect(formatMonthYear(utcDate(2025, 4, 1))).toBe('May 2025');
  });
});

describe('addMonths', () => {
  it('adds months and clamps the day for short months', () => {
    expect(formatDate(addMonths(utcDate(2025, 0, 31), 1))).toBe('Feb 28, 2025');
    expect(formatDate(addMonths(utcDate(2025, 3, 14), 24))).toBe('Apr 14, 2027');
  });
});

describe('addDays', () => {
  it('adds whole days across month/year boundaries (first distribution = wire + 30)', () => {
    expect(formatDate(addDays(utcDate(2025, 3, 14), 30))).toBe('May 14, 2025');
    expect(formatDate(addDays(utcDate(2025, 11, 20), 30))).toBe('Jan 19, 2026');
  });
});

describe('daysBetween / arrival', () => {
  const now = utcDate(2026, 5, 30); // Jun 30, 2026
  it('counts days', () => {
    expect(daysBetween(now, utcDate(2026, 6, 1))).toBe(1);
  });
  it('labels arrival', () => {
    expect(arrivalLabel(utcDate(2026, 6, 1), now)).toBe('Arrives tomorrow');
    expect(arrivalLabel(utcDate(2026, 5, 30), now)).toBe('Arrives today');
    expect(arrivalLabel(utcDate(2026, 6, 6), now)).toBe('Arrives in 6 days');
  });
  it('labels in-days', () => {
    expect(inDaysLabel(utcDate(2026, 6, 21), now)).toBe('in 21 days');
  });
});

describe('months remaining', () => {
  const now = utcDate(2026, 5, 30);
  it('counts whole months', () => {
    expect(wholeMonthsUntil(now, utcDate(2027, 3, 14))).toBe(9);
  });
  it('labels remaining', () => {
    expect(monthsRemainingLabel(utcDate(2027, 3, 14), now)).toBe('9 months remaining');
    expect(monthsRemainingLabel(utcDate(2025, 0, 1), now)).toBe('Matured');
  });
});
