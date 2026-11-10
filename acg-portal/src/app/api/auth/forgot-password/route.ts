import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { assertSameOrigin, clientIp, handle, json } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { emailLinkSecret, passwordLinkStatements } from '@/server/email/password-links';

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const database = db();
    const now = Date.now();
    const ip = clientIp(request) ?? 'unknown';
    const input = z
      .object({ email: z.string().trim().email().max(320) })
      .safeParse(await request.json().catch(() => null));
    if (input.success && (await rateLimit(database, 'reset-ip:' + ip, 12, 600_000, now)).allowed) {
      const email = input.data.email.toLowerCase();
      const key = createHash('sha256').update(email).digest('hex');
      if ((await rateLimit(database, 'reset-email:' + key, 3, 600_000, now)).allowed) {
        await database.batch(passwordLinkStatements(database, email, 'reset', emailLinkSecret(), now));
      }
    }
    return json({ ok: true });
  });
}
