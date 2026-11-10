// Money is represented as integer cents everywhere in the domain. Rates are
// basis points (1800 = 18.00%). These helpers are the single source of truth
// for formatting and parsing — keep display logic out of components.

/** Format whole-dollar cents as "$250,000" (no decimals when even dollars). */
export function formatUSD(cents: number): string {
  const dollars = cents / 100;
  const hasFraction = cents % 100 !== 0;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  });
}

/** Compact portfolio figures: "$48.2M", "$612K", "$5.4M". */
export function formatCompactUSD(cents: number): string {
  const dollars = cents / 100;
  const abs = Math.abs(dollars);
  if (abs >= 1_000_000) {
    return `$${trimZero(dollars / 1_000_000)}M`;
  }
  if (abs >= 1_000) {
    return `$${Math.round(dollars / 1_000)}K`;
  }
  return formatUSD(cents);
}

function trimZero(n: number): string {
  // One decimal place, but drop a trailing ".0" (e.g. 48.2, 6.71 -> keep 2dp
  // when meaningful). We keep up to 2 significant fractional digits.
  const r = Math.round(n * 100) / 100;
  if (Number.isInteger(r)) return String(r);
  // Prefer 1 decimal unless 2 are needed to avoid losing precision visually.
  const oneDp = Math.round(n * 10) / 10;
  return Number.isInteger(oneDp * 10) && Math.abs(oneDp - r) < 0.005
    ? String(oneDp)
    : String(r);
}

/** "18%" — used in tables and pills. */
export function formatRate(bps: number): string {
  return `${bps / 100}%`;
}

/** "18.0%" — used on the investor overview hero. */
export function formatRatePrecise(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

/**
 * Parse a user-entered principal like "250,000", "$250,000", or "1000000"
 * into integer cents. Returns null when the input is not a positive amount.
 */
export function parseMoneyToCents(input: string): number | null {
  if (input == null) return null;
  const cleaned = String(input).replace(/[$,\s]/g, '');
  if (cleaned === '' || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const dollars = Number(cleaned);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return Math.round(dollars * 100);
}

/** Compute the monthly distribution in cents from principal and annual rate. */
export function monthlyDistributionCents(principalCents: number, rateBps: number): number {
  // annual interest = principal * rate; monthly = annual / 12
  return Math.round((principalCents * rateBps) / 10_000 / 12);
}
