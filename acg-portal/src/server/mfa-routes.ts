import 'server-only';
import { NextRequest } from 'next/server';
import { assertSameOrigin, HttpError } from '@/lib/http';
import { apiRequireUser, type SessionUser } from '@/lib/auth';
import { db } from '@/server/db/client';
import { rateLimit } from '@/lib/ratelimit';
import type { D1Database } from '@/server/db/d1';

/**
 * Common guard for the 2FA settings endpoints: same-origin, signed in, and a
 * per-user throttle on the password/code re-authentication they all require.
 * They only ever act on the signed-in user's own factor.
 */
export async function mfaSettingsGuard(req: NextRequest): Promise<{ user: SessionUser; database: D1Database }> {
  assertSameOrigin(req);
  const user = await apiRequireUser();
  const database = db();
  const limit = await rateLimit(database, `mfa-settings:${user.id}`, 10, 10 * 60 * 1000);
  if (!limit.allowed) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
  return { user, database };
}
