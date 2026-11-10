import { NextRequest } from 'next/server';
import { handle, json, errorJson, clientIp, assertSameOrigin } from '@/lib/http';
import { apiRequireOwnInvestor } from '@/lib/auth';
import { firstPasswordSchema } from '@/lib/validation';
import { setInitialPassword } from '@/server/lifecycle';

// Forced first-login password set. No current password — the authenticated
// session proves identity, and setInitialPassword only works while the account
// is still flagged mustChangePassword.
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const { user } = await apiRequireOwnInvestor();
    const parsed = firstPasswordSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);
    await setInitialPassword(user.id, parsed.data.newPassword, clientIp(req));
    return json({ ok: true, redirectTo: '/portal/overview' });
  });
}
