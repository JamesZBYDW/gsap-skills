import { NextResponse } from 'next/server';
import { safeErrorSummary } from '@/server/db/d1';

/** Error carrying an HTTP status; thrown by guards, caught by route wrappers. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
  }
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function errorJson(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Run a route handler, mapping HttpError + unexpected errors to JSON. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) {
      return errorJson(err.message, err.status);
    }
    // Category only: error messages can carry SQL or bound values.
    console.error('[api] unhandled error', safeErrorSummary(err));
    return errorJson('Something went wrong. Please try again.', 500);
  }
}

/**
 * The visitor's IP, from `CF-Connecting-IP` only. On Cloudflare Workers that
 * header is set by the edge and cannot be supplied by the visitor, unlike
 * `X-Forwarded-For` / `X-Real-IP`, which are never trusted (a forged value
 * must not dodge the login throttle or pollute the audit log).
 */
export function clientIp(req: Request): string | null {
  const cf = req.headers.get('cf-connecting-ip');
  return cf ? cf.trim() : null;
}

/**
 * CSRF defense for state-changing requests: require the Origin (or Referer) to
 * match the request host. Combined with SameSite=Lax cookies this blocks
 * cross-site form/fetch submissions.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get('origin') ?? req.headers.get('referer');
  if (!origin) {
    // Some same-origin fetches omit Origin; allow when Sec-Fetch-Site is same-origin.
    const sfs = req.headers.get('sec-fetch-site');
    if (sfs === 'same-origin' || sfs === 'none') return;
    throw new HttpError(403, 'Missing origin.');
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, 'Bad origin.');
  }
  const host = req.headers.get('host');
  if (!host || originHost !== host) {
    throw new HttpError(403, 'Cross-origin request rejected.');
  }
}
