// Pure, client-safe helpers for the management note-terms forms. These mirror
// the server's derivations so the UI can preview the auto-populated distribution
// amount and maturity date; the server recomputes both authoritatively.

import { parseISODate, toISODate, addMonths, addDays, formatDateLong } from './dates';

/**
 * Per-distribution amount = principal × (rate% ÷ 100) ÷ 12, formatted in dollars
 * (e.g. "3,750"). Returns '' when inputs are missing or invalid.
 */
export function computeDistributionDollars(principalStr: string, rateStr: string): string {
  const p = parseFloat(String(principalStr).replace(/[^0-9.]/g, ''));
  const r = parseFloat(String(rateStr).replace(/[^0-9.]/g, ''));
  if (!isFinite(p) || !isFinite(r) || p <= 0 || r < 0) return '';
  const monthly = (p * (r / 100)) / 12;
  return monthly.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Add whole calendar months to a YYYY-MM-DD string (clamping the day). Returns ''. */
export function addMonthsISO(iso: string, months: number): string {
  const d = parseISODate(iso);
  if (!d) return '';
  return toISODate(addMonths(d, months));
}

/** Add whole days to a YYYY-MM-DD string (first distribution = wire + 30). Returns ''. */
export function addDaysISO(iso: string, days: number): string {
  const d = parseISODate(iso);
  if (!d) return '';
  return toISODate(addDays(d, days));
}

/** "2028-02-01" → "February 1, 2028". Returns '' for empty/invalid input. */
export function formatISOToLong(iso: string): string {
  const d = parseISODate(iso);
  if (!d) return '';
  return formatDateLong(d);
}
