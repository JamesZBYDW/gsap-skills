import { NextRequest } from 'next/server';
import { handle, json, assertSameOrigin } from '@/lib/http';
import { apiRequireTeam } from '@/lib/auth';
import { markThreadReadByTeam } from '@/server/lifecycle';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(req);
    await apiRequireTeam();
    const { id } = await ctx.params;
    await markThreadReadByTeam(id);
    return json({ ok: true });
  });
}
