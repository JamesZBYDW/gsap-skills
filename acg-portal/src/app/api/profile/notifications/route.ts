import { NextRequest } from 'next/server';
import { handle, json, errorJson, clientIp, assertSameOrigin } from '@/lib/http';
import { prisma } from '@/lib/db';
import { apiRequireOwnInvestor } from '@/lib/auth';
import { notifPrefSchema } from '@/lib/validation';
import { audit } from '@/lib/audit';

// Toggle a notification preference for the signed-in investor.
export async function PATCH(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const { user, investorId } = await apiRequireOwnInvestor();

    const parsed = notifPrefSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);

    const { key, value } = parsed.data;
    await prisma.notifPref.upsert({
      where: { investorId },
      create: { investorId, [key]: value },
      update: { [key]: value },
    });

    await audit({
      action: 'NOTIF_PREF_CHANGE',
      actorUserId: user.id,
      targetType: 'Investor',
      targetId: investorId,
      metadata: { key, value },
      ip: clientIp(req),
    });
    return json({ ok: true });
  });
}
