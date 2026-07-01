// The ACG Promissory Note rate structure. Fixed for the term — NOT guaranteed.
// These are the firm's published terms; counsel must sign off before launch.
// (Compliance: never present these as guaranteed returns — see DESIGN_BRIEF.md §9.)

export const MIN_PRINCIPAL_CENTS = 100_000_00; // $100,000 minimum investment

// Upper bound kept below the 32-bit Int column ceiling ($21.47M) to prevent
// overflow; comfortably above realistic note sizes. Raise this only alongside a
// migration of principal columns to BigInt.
export const MAX_PRINCIPAL_CENTS = 2_000_000_000; // $20,000,000

export interface TermOption {
  months: number;
  rateBps: number;
  label: string; // e.g. "24 months"
  yearsLabel: string; // e.g. "2 years"
}

export const TERM_OPTIONS: readonly TermOption[] = [
  { months: 12, rateBps: 1200, label: '12 months', yearsLabel: '1 year' },
  { months: 18, rateBps: 1500, label: '18 months', yearsLabel: '1.5 years' },
  { months: 24, rateBps: 1800, label: '24 months', yearsLabel: '2 years' },
  { months: 36, rateBps: 2000, label: '36 months', yearsLabel: '3 years' },
];

const TERM_TO_RATE = new Map<number, number>(TERM_OPTIONS.map((t) => [t.months, t.rateBps]));

/** Default rate when a term is unrecognized (24mo / 18%) — mirrors prototype. */
export const DEFAULT_RATE_BPS = 1800;

/** Derive the fixed annual rate (bps) for a term in months. */
export function deriveRateBps(termMonths: number): number {
  return TERM_TO_RATE.get(termMonths) ?? DEFAULT_RATE_BPS;
}

/** True when the term is one of the published, counsel-approved terms. */
export function isSupportedTerm(termMonths: number): boolean {
  return TERM_TO_RATE.has(termMonths);
}

/**
 * Parse a term from free text ("24 months", "24mo", "24") into a whole number
 * of months, or null if not parseable.
 */
export function parseTermMonths(input: string): number | null {
  if (input == null) return null;
  const m = String(input).match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
