import { NextResponse } from 'next/server';

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
    console.error('[api] unhandled error', err);
    return errorJson('Something went wrong. Please try again.', 500);
  }
}

/** Best-effort client IP from common proxy headers. */
export function clientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.headers.get('x-real-ip');
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
