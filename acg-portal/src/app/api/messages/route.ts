import { NextRequest } from 'next/server';
import { handle, json, errorJson, clientIp, assertSameOrigin } from '@/lib/http';
import { prisma } from '@/lib/db';
import { apiRequireOwnInvestor } from '@/lib/auth';
import { messageSchema } from '@/lib/validation';
import { audit } from '@/lib/audit';

// Investor posts a message to their IR concierge thread.
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const { user, investorId } = await apiRequireOwnInvestor();

    const parsed = messageSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);

    const investor = await prisma.investor.findUniqueOrThrow({
      where: { id: investorId },
      select: { legalName: true },
    });

    const msg = await prisma.message.create({
      data: {
        investorId,
        author: 'INVESTOR',
        authorName: investor.legalName,
        text: parsed.data.text,
        readByInvestor: true,
        readByTeam: false,
      },
    });

    await audit({ action: 'MESSAGE_SEND', actorUserId: user.id, targetType: 'Message', targetId: msg.id, ip: clientIp(req) });
    return json({ ok: true, id: msg.id });
  });
}
