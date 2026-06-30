import { NextRequest } from 'next/server';
import { handle, json, errorJson, clientIp, assertSameOrigin } from '@/lib/http';
import { prisma } from '@/lib/db';
import { apiRequireOwnInvestor } from '@/lib/auth';
import { requestCreateSchema } from '@/lib/validation';
import { requestTypeTitle, BANKING_PHONE_NOTE } from '@/lib/labels';
import { formatDate } from '@/lib/dates';
import { audit } from '@/lib/audit';

// Investor submits a request -> lands in the team Requests queue (PENDING_REVIEW).
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const { user, investorId } = await apiRequireOwnInvestor();

    const parsed = requestCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);

    const { type, detail } = parsed.data;
    const today = formatDate(new Date());

    const created = await prisma.request.create({
      data: {
        investorId,
        type,
        title: requestTypeTitle[type],
        detail,
        status: 'PENDING_REVIEW',
        note: type === 'UPDATE_BANKING' ? BANKING_PHONE_NOTE : '',
        history: { create: [{ label: 'Submitted', dateText: today, done: true, order: 0 }] },
      },
    });

    await audit({
      action: 'REQUEST_CREATE',
      actorUserId: user.id,
      targetType: 'Request',
      targetId: created.id,
      metadata: { type },
      ip: clientIp(req),
    });

    return json({ ok: true, id: created.id });
  });
}
