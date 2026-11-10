import 'server-only';
import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { assertSameOrigin, HttpError } from '@/lib/http';
import { getImpersonatedInvestorId } from '@/lib/session';
import { apiRequireUser, type SessionUser } from '@/lib/auth';
import { db } from '@/server/db/client';
import { rateLimit } from '@/lib/ratelimit';
import type { D1Database } from '@/server/db/d1';

/**
 * Common guard for the 2FA settings endpoints: same-origin, signed in, not in
 * a read-only impersonation view, not still on a management-issued password,
 * and a per-user throttle on the password/code re-authentication they all
 * require. They only ever act on the signed-in user's own factor.
 */
export async function mfaSettingsGuard(req: NextRequest): Promise<{ user: SessionUser; database: D1Database }> {
  assertSameOrigin(req);
  const user = await apiRequireUser();
  if (await getImpersonatedInvestorId()) throw new HttpError(403, 'Read-only view.');
  if (user.mustChangePassword) throw new HttpError(403, 'Set your password before changing two-factor settings.');
  const database = db();
  const limit = await rateLimit(database, `mfa-settings:${user.id}`, 10, 10 * 60 * 1000);
  if (!limit.allowed) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
  return { user, database };
}

/** JSON that must never be cached or stored (TOTP secrets, recovery codes). */
export function privateJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Pragma: 'no-cache' } });
}
