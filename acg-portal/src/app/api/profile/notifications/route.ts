import { NextRequest } from 'next/server';
import { handle, json, errorJson, clientIp, assertSameOrigin } from '@/lib/http';
import { setNotifPref } from '@/server/lifecycle';
import { apiRequireOwnInvestor } from '@/lib/auth';
import { notifPrefSchema } from '@/lib/validation';

// Toggle a notification preference for the signed-in investor.
export async function PATCH(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const { user, investorId } = await apiRequireOwnInvestor();

    const parsed = notifPrefSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);

    const { key, value } = parsed.data;
    await setNotifPref(investorId, key, value, user.id, clientIp(req));
    return json({ ok: true });
  });
}
