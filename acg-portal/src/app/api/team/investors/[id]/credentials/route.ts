import { NextRequest } from 'next/server';
import { handle, json, errorJson, clientIp, assertSameOrigin } from '@/lib/http';
import { apiRequireTeam } from '@/lib/auth';
import { credentialsSchema } from '@/lib/validation';
import { provisionCredentials } from '@/server/lifecycle';

// Management provisions or resets an investor's login credentials.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await apiRequireTeam();
    const { id } = await ctx.params;
    const parsed = credentialsSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);
    await provisionCredentials(id, parsed.data, user.id, clientIp(req));
    return json({ ok: true });
  });
}
