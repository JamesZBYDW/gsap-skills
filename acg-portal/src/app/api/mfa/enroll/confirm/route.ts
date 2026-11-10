import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, json, errorJson, clientIp } from '@/lib/http';
import { mfaSettingsGuard } from '@/server/mfa-routes';
import { mfaKeys } from '@/server/mfa-key';
import { confirmEnrollment } from '@/server/mfa';

const schema = z.object({ code: z.string().trim().min(1, 'Enter the code.').max(40) });

/** Verify the first code from the app; turns 2FA on and returns recovery codes once. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const { user, database } = await mfaSettingsGuard(req);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);
    const recoveryCodes = await confirmEnrollment(database, await mfaKeys(), user.id, parsed.data.code, clientIp(req));
    return json({ ok: true, recoveryCodes });
  });
}
