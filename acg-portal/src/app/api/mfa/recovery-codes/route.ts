import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, errorJson, clientIp } from '@/lib/http';
import { mfaSettingsGuard, privateJson } from '@/server/mfa-routes';
import { mfaKeys } from '@/server/mfa-key';
import { regenerateRecoveryCodes } from '@/server/mfa';

const schema = z.object({
  password: z.string().min(1, 'Enter your password.').max(200),
  code: z.string().trim().min(1, 'Enter a code.').max(40),
});

/** Replace all recovery codes (password + current code); returns the new set once. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const { user, database } = await mfaSettingsGuard(req);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);
    const recoveryCodes = await regenerateRecoveryCodes(database, await mfaKeys(), user.id, parsed.data.password, parsed.data.code, clientIp(req));
    return privateJson({ ok: true, recoveryCodes });
  });
}
