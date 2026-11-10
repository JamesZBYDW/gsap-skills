import { db } from '@/server/db/client';
import { assertSameOrigin, clientIp, handle, json, errorJson } from '@/lib/http';
import { firstPasswordSchema } from '@/lib/validation';
import { rateLimit } from '@/lib/ratelimit';
import { redeemPasswordLink } from '@/server/email/password-links';
import { z } from 'zod';

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const database = db();
    const ip = clientIp(request);
    if (!(await rateLimit(database, 'reset-use:' + (ip ?? 'unknown'), 20, 600_000)).allowed)
      return errorJson('Too many attempts. Please try again later.', 429);
    const input = firstPasswordSchema
      .extend({ token: z.string().min(32).max(200) })
      .safeParse(await request.json().catch(() => null));
    if (!input.success) return errorJson(input.error.issues[0]?.message ?? 'Invalid input.', 400);
    await redeemPasswordLink(database, input.data.token, input.data.newPassword, ip);
    return json({ ok: true });
  });
}
