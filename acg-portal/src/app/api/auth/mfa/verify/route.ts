import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, json, errorJson, clientIp, assertSameOrigin } from '@/lib/http';
import { db } from '@/server/db/client';
import { completeChallenge } from '@/server/mfa';
import { mfaKeys } from '@/server/mfa-key';
import { recordFailedLogin } from '@/lib/auth';
import { clearMfaChallengeCookie, getMfaChallengeToken, setSessionCookie } from '@/lib/session';
import { rateLimit, LOGIN_IP_LIMIT, LOGIN_IP_WINDOW_MS } from '@/lib/ratelimit';

const bodySchema = z.object({ code: z.string().trim().min(1, 'Enter the code.').max(40) });

// Second sign-in step: completes the pending challenge (cookie) with a code
// from the authenticator app or a recovery code. Only here does a session for
// an account with 2FA get created.
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const ip = clientIp(req);
    const database = db();
    const limit = await rateLimit(database, `mfa:${ip ?? 'unknown'}`, LOGIN_IP_LIMIT, LOGIN_IP_WINDOW_MS);
    if (!limit.allowed) return errorJson('Too many attempts. Please wait a few minutes and try again.', 429);

    const token = await getMfaChallengeToken();
    if (!token) return json({ error: 'Your sign-in expired. Please sign in again.', redirectTo: '/login' }, 401);

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);

    const keys = await mfaKeys();
    const outcome = await completeChallenge(
      database,
      keys,
      token,
      parsed.data.code,
      { ip, userAgent: req.headers.get('user-agent') },
      (userId, checkedHash) => recordFailedLogin(database, userId, checkedHash, ip),
    );

    if (outcome.ok) {
      await clearMfaChallengeCookie();
      await setSessionCookie(outcome.session);
      return json({ ok: true, redirectTo: outcome.role === 'TEAM' ? '/console/overview' : '/portal/overview' });
    }
    if (outcome.reason === 'invalid') {
      return json({ error: 'That code is not valid.', attemptsLeft: outcome.attemptsLeft }, 400);
    }
    await clearMfaChallengeCookie();
    return json({ error: 'Your sign-in expired. Please sign in again.', redirectTo: '/login' }, 401);
  });
}
