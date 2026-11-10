// D1 access. The portal talks to D1 through a small typed repository layer
// (src/server/db/repo.ts) and explicit, atomic `batch()` calls for every
// multi-row write (src/server/lifecycle.ts) — D1 ignores interactive and
// implicit transactions, so no ORM-style transaction emulation is used.
//
// The interfaces below are the subset of the Workers D1 API the app uses.
// They are structural, so the real binding (Worker) and the local D1 from
// wrangler's getPlatformProxy (tests, scripts) both satisfy them.

export interface D1Meta {
  changes?: number;
  [key: string]: unknown;
}

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: D1Meta;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  /** Runs the statements as one SQL transaction: all succeed or none apply. */
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

/** New random identifier for a row. */
export const newId = (): string => crypto.randomUUID();

/** Milliseconds since the epoch, the storage format for every timestamp. */
export const ms = (d: Date): number => d.getTime();
export const msOrNull = (d: Date | null | undefined): number | null => (d ? d.getTime() : null);
export const toDate = (v: unknown): Date => new Date(Number(v));
export const toDateOrNull = (v: unknown): Date | null => (v === null || v === undefined ? null : new Date(Number(v)));
export const toBool = (v: unknown): boolean => Number(v) === 1;

/** True when `err` is a UNIQUE violation, optionally on a specific `table.column`. */
export function isUniqueViolation(err: unknown, column?: string): boolean {
  const message = err instanceof Error ? err.message : String(err);
  if (!/UNIQUE constraint failed/i.test(message)) return false;
  return column ? message.includes(column) : true;
}

/**
 * A log-safe summary of a database/runtime error: its name and a coarse class
 * only. Never the message, which can contain SQL or bound values.
 */
export function safeErrorSummary(err: unknown): string {
  if (!(err instanceof Error)) return 'non-error thrown';
  const m = err.message;
  const kind = /constraint/i.test(m)
    ? 'constraint'
    : /D1_|SQLITE/i.test(m)
      ? 'database'
      : /timeout|timed out/i.test(m)
        ? 'timeout'
        : 'other';
  return `${err.name}:${kind}`;
}
