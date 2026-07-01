import { NextRequest } from 'next/server';
import { handle, json, errorJson, clientIp, assertSameOrigin } from '@/lib/http';
import { apiRequireOwnInvestor } from '@/lib/auth';
import { passwordChangeSchema } from '@/lib/validation';
import { changeOwnPassword } from '@/server/lifecycle';

// Investor changes their own password.
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const { user } = await apiRequireOwnInvestor();
    const parsed = passwordChangeSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);
    await changeOwnPassword(user.id, parsed.data.currentPassword, parsed.data.newPassword, clientIp(req));
    return json({ ok: true });
  });
}
