// Date helpers. The portal's "dates" (wire, distribution, maturity) are
// calendar dates, so we normalize everything to UTC midnight and format with
// UTC getters to avoid server-timezone off-by-one drift.

export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const MS_PER_DAY = 86_400_000;

/** A UTC-midnight Date for the given calendar parts. */
export function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

/** Normalize a Date to UTC midnight (drops time-of-day). */
export function startOfUTCDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** "Apr 14, 2027" */
export function formatDate(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** "April 14, 2027" — full month, used on the investor overview maturity hero. */
export function formatDateLong(d: Date): string {
  return `${MONTHS_FULL[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** "May 2025" */
export function formatMonthYear(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** "Monday · Jun 30, 2026" — team top bar. Uses local time for the weekday. */
export function formatWeekdayDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} · ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Add n calendar months, clamping the day to the target month's length. */
export function addMonths(date: Date, n: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(y, m + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

/** Whole days from a to b (b - a), using UTC-day boundaries. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfUTCDay(b).getTime() - startOfUTCDay(a).getTime()) / MS_PER_DAY);
}

/**
 * The first distribution date: the `distributionDay` of the month AFTER the
 * wire month. Wire Apr 14 (day=1) -> May 1.
 */
export function firstDistributionAfter(wireDate: Date, distributionDay: number): Date {
  const y = wireDate.getUTCFullYear();
  const m = wireDate.getUTCMonth();
  const first = new Date(Date.UTC(y, m + 1, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(distributionDay, lastDay));
  return first;
}

/** "Arrives today" / "Arrives tomorrow" / "Arrives in 6 days" (future only). */
export function arrivalLabel(due: Date, now: Date): string {
  const d = daysBetween(now, due);
  if (d < 0) return `Posted ${formatDate(due)}`;
  if (d === 0) return 'Arrives today';
  if (d === 1) return 'Arrives tomorrow';
  return `Arrives in ${d} days`;
}

/** "today" / "tomorrow" / "in 21 days" / "5 days ago" */
export function inDaysLabel(date: Date, now: Date): string {
  const d = daysBetween(now, date);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d > 1) return `in ${d} days`;
  if (d === -1) return 'yesterday';
  return `${Math.abs(d)} days ago`;
}

/** Whole months between now and a future date (floored, min 0). */
export function wholeMonthsUntil(now: Date, future: Date): number {
  if (future <= now) return 0;
  let months =
    (future.getUTCFullYear() - now.getUTCFullYear()) * 12 +
    (future.getUTCMonth() - now.getUTCMonth());
  if (future.getUTCDate() < now.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/** "10 months remaining" / "1 month remaining" / "Matured" */
export function monthsRemainingLabel(maturity: Date, now: Date): string {
  if (maturity <= now) return 'Matured';
  const m = wholeMonthsUntil(now, maturity);
  if (m <= 0) {
    const d = daysBetween(now, maturity);
    return `${d} day${d === 1 ? '' : 's'} remaining`;
  }
  return `${m} month${m === 1 ? '' : 's'} remaining`;
}
