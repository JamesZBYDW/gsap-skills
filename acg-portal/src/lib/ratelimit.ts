import 'server-only';
import type { D1Database } from '@/server/db/d1';

// Shared fixed-window rate limiter backed by D1, keyed by an arbitrary string
// (e.g. `login:<ip>`). One atomic upsert both resets an expired window and
// counts the hit, so concurrent requests on any Worker isolate see one count.
// (SQLite evaluates every SET expression against the pre-update row.)

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const HIT = `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
ON CONFLICT (key) DO UPDATE SET
  count = CASE WHEN rate_limits.window_start + ?3 <= ?2 THEN 1 ELSE rate_limits.count + 1 END,
  window_start = CASE WHEN rate_limits.window_start + ?3 <= ?2 THEN ?2 ELSE rate_limits.window_start END
RETURNING count, window_start`;

export async function rateLimit(
  database: D1Database,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<RateLimitResult> {
  const row = await database.prepare(HIT).bind(key, now, windowMs).first<{ count: number; window_start: number }>();
  const count = Number(row?.count ?? 1);
  const windowStart = Number(row?.window_start ?? now);

  // Opportunistic cleanup of long-expired windows (cheap, indexed).
  if (count === 1) {
    await database
      .prepare('DELETE FROM rate_limits WHERE window_start < ?')
      .bind(now - 2 * windowMs)
      .run()
      .catch(() => {});
  }

  if (count > limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)) };
  }
  return { allowed: true, remaining: limit - count, retryAfterSeconds: 0 };
}

// Account lockout policy for failed logins (enforced via users columns).
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MS = 1000 * 60 * 15; // 15 minutes

// Per-IP request throttle for the login endpoint.
export const LOGIN_IP_LIMIT = 20;
export const LOGIN_IP_WINDOW_MS = 1000 * 60 * 10; // 10 minutes
