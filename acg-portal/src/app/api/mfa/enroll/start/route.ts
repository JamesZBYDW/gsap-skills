import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, json, errorJson, clientIp } from '@/lib/http';
import { mfaSettingsGuard } from '@/server/mfa-routes';
import { mfaKeys } from '@/server/mfa-key';
import { startEnrollment } from '@/server/mfa';

const schema = z.object({ password: z.string().min(1, 'Enter your password.').max(200) });

/** Begin authenticator-app setup (password required). Nothing changes at sign-in until confirmed. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const { user, database } = await mfaSettingsGuard(req);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);
    const start = await startEnrollment(database, await mfaKeys(), user.id, parsed.data.password, clientIp(req));
    return json({ ok: true, secret: start.secret, otpauthUri: start.otpauthUri });
  });
}
