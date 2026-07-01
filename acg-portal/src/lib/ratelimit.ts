import 'server-only';

// In-memory fixed-window rate limiter, keyed by an arbitrary string (e.g.
// `login:<ip>`). This is per-process; in a multi-instance/serverless
// deployment, back this with Redis/Upstash for correctness. The interface is
// intentionally small so the store can be swapped without touching callers.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

// Account lockout policy for failed logins (enforced via User columns).
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MS = 1000 * 60 * 15; // 15 minutes

// Per-IP request throttle for the login endpoint.
export const LOGIN_IP_LIMIT = 20;
export const LOGIN_IP_WINDOW_MS = 1000 * 60 * 10; // 10 minutes
