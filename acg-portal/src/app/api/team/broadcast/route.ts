import { NextRequest } from 'next/server';
import { handle, json, errorJson, clientIp, assertSameOrigin } from '@/lib/http';
import { apiRequireTeam } from '@/lib/auth';
import { broadcastSchema } from '@/lib/validation';
import { broadcast } from '@/server/lifecycle';

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await apiRequireTeam();
    const parsed = broadcastSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);
    const authorName = `${user.name} · Investor Relations`;
    const recipients = await broadcast(parsed.data.text, authorName, user.id, clientIp(req));
    return json({ ok: true, recipients });
  });
}
