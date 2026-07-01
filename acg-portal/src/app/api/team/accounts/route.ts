import { NextRequest } from 'next/server';
import { handle, json, errorJson, clientIp, assertSameOrigin } from '@/lib/http';
import { apiRequireTeam } from '@/lib/auth';
import { createAccountSchema } from '@/lib/validation';
import { createInvestorAccount } from '@/server/lifecycle';

// Management creates an entire investor account: details + note terms + login.
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await apiRequireTeam();
    const parsed = createAccountSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);
    const investor = await createInvestorAccount(parsed.data, user.id, clientIp(req));
    return json({ ok: true, investorId: investor.id });
  });
}
