import { NextRequest } from 'next/server';
import { handle, json, errorJson, clientIp, assertSameOrigin } from '@/lib/http';
import { apiRequireTeam } from '@/lib/auth';
import { addInvestorSchema } from '@/lib/validation';
import { parseMoneyToCents } from '@/lib/money';
import { addInvestor } from '@/server/lifecycle';

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await apiRequireTeam();
    const parsed = addInvestorSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);

    const { name, email, type, principal, termMonths } = parsed.data;
    const investor = await addInvestor(
      { name, email, type, principalCents: principal ? parseMoneyToCents(principal) : null, termMonths },
      user.id,
      clientIp(req),
    );
    return json({ ok: true, investorId: investor.id });
  });
}
