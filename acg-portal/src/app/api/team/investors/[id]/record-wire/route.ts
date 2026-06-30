import { NextRequest } from 'next/server';
import { handle, json, clientIp, assertSameOrigin } from '@/lib/http';
import { apiRequireTeam } from '@/lib/auth';
import { recordWire } from '@/server/lifecycle';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await apiRequireTeam();
    const { id } = await ctx.params;
    await recordWire(id, user.id, clientIp(req));
    return json({ ok: true });
  });
}
