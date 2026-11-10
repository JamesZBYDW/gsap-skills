import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { handle, json, errorJson, clientIp, assertSameOrigin } from '@/lib/http';
import { apiRequireTeamWrite } from '@/lib/team-write';
import { createAccountSchema } from '@/lib/validation';
import { createInvestorAccount } from '@/server/lifecycle';

// Management creates an entire investor account: details + note terms + login.
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await apiRequireTeamWrite();
    const body = await req.json().catch(() => null);
    // Invitations let the account holder choose their first password in the emailed form.
    const parsed = createAccountSchema.safeParse(body?.sendInvite === true
      ? { ...body, password: randomBytes(32).toString('base64url') + '1a', mustChange: true }
      : body);
    if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);
    const investor = await createInvestorAccount(parsed.data, user.id, clientIp(req));
    return json({ ok: true, investorId: investor.id });
  });
}
