import { NextRequest } from 'next/server';
import { handle, json, errorJson, clientIp, assertSameOrigin } from '@/lib/http';
import { db } from '@/server/db/client';
import { investorExists } from '@/server/db/repo';
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

    const database = db();
    const investorId = parsed.data.investorId;
    if (!(await investorExists(database, investorId))) return errorJson('Investor not found.', 404);

    await setImpersonation(investorId);
    await audit(database, { action: 'IMPERSONATION_START', actorUserId: user.id, targetType: 'Investor', targetId: investorId, ip: clientIp(req) });
    return json({ ok: true, redirectTo: '/portal/overview' });
  });
}
