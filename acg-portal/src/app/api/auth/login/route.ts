import { NextRequest } from 'next/server';
import { handle, json, errorJson, clientIp, assertSameOrigin } from '@/lib/http';
import { attemptLogin } from '@/lib/auth';
import { loginSchema } from '@/lib/validation';
import { rateLimit, LOGIN_IP_LIMIT, LOGIN_IP_WINDOW_MS } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const ip = clientIp(req);

    const limit = rateLimit(`login:${ip ?? 'unknown'}`, LOGIN_IP_LIMIT, LOGIN_IP_WINDOW_MS);
    if (!limit.allowed) {
      return errorJson('Too many attempts. Please wait a few minutes and try again.', 429);
    }

    const parsed = loginSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return errorJson(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);
    }

    const result = await attemptLogin({
      email: parsed.data.email,
      password: parsed.data.password,
      expectedRole: parsed.data.role,
      ip,
      userAgent: req.headers.get('user-agent'),
    });

    if (!result.ok) {
      return errorJson(result.error ?? 'Invalid email or password.', 401);
    }

    const redirectTo = result.user!.role === 'TEAM' ? '/console/overview' : '/portal/overview';
    return json({ ok: true, redirectTo });
  });
}
