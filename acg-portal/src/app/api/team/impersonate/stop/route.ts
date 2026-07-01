import { NextRequest } from 'next/server';
import { handle, json, clientIp, assertSameOrigin } from '@/lib/http';
import { apiRequireTeam } from '@/lib/auth';
import { clearImpersonation, getImpersonatedInvestorId } from '@/lib/session';
import { audit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await apiRequireTeam();
    const prior = await getImpersonatedInvestorId();
    await clearImpersonation();
    await audit({ action: 'IMPERSONATION_END', actorUserId: user.id, targetType: 'Investor', targetId: prior, ip: clientIp(req) });
    return json({ ok: true });
  });
}
