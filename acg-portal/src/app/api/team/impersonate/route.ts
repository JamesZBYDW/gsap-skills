import { NextRequest } from 'next/server';
import { handle, json, errorJson, clientIp, assertSameOrigin } from '@/lib/http';
import { prisma } from '@/lib/db';
import { apiRequireTeam } from '@/lib/auth';
import { setImpersonation } from '@/lib/session';
import { impersonateSchema } from '@/lib/validation';
import { audit } from '@/lib/audit';

// Start a read-only "view investor portal as" session. Only TEAM users; every
// start is audited. Mutations remain blocked while impersonating (see auth.ts).
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await apiRequireTeam();
    const parsed = impersonateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);

    const investor = await prisma.investor.findUnique({ where: { id: parsed.data.investorId }, select: { id: true } });
    if (!investor) return errorJson('Investor not found.', 404);

    await setImpersonation(investor.id);
    await audit({ action: 'IMPERSONATION_START', actorUserId: user.id, targetType: 'Investor', targetId: investor.id, ip: clientIp(req) });
    return json({ ok: true, redirectTo: '/portal/overview' });
  });
}
