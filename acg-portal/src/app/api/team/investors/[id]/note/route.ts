import { NextRequest } from 'next/server';
import { handle, json, errorJson, clientIp, assertSameOrigin } from '@/lib/http';
import { apiRequireTeam } from '@/lib/auth';
import { noteTermsSchema } from '@/lib/validation';
import { setNoteTerms } from '@/server/lifecycle';

// Management sets/updates the note terms; this drives the investor's schedule.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await apiRequireTeam();
    const { id } = await ctx.params;
    const parsed = noteTermsSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);
    await setNoteTerms(id, parsed.data, user.id, clientIp(req));
    return json({ ok: true });
  });
}
