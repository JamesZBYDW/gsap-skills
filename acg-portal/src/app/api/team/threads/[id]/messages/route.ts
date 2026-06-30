import { NextRequest } from 'next/server';
import { handle, json, errorJson, clientIp, assertSameOrigin } from '@/lib/http';
import { apiRequireTeam } from '@/lib/auth';
import { messageSchema } from '@/lib/validation';
import { sendTeamMessage } from '@/server/lifecycle';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await apiRequireTeam();
    const { id } = await ctx.params;
    const parsed = messageSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);
    const authorName = `${user.name} · Investor Relations`;
    const msg = await sendTeamMessage(id, parsed.data.text, authorName, user.id, clientIp(req));
    return json({ ok: true, id: msg.id });
  });
}
