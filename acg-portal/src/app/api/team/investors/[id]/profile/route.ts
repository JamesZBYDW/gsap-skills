import { NextRequest } from 'next/server';
import { handle, json, errorJson, clientIp, assertSameOrigin } from '@/lib/http';
import { apiRequireTeam } from '@/lib/auth';
import { investorProfileSchema } from '@/lib/validation';
import { updateInvestorProfile } from '@/server/lifecycle';

// Management edits an investor's profile data (identity, phone, banking, W-9,
// accreditation) — what the investor sees read-only on their Profile page.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await apiRequireTeam();
    const { id } = await ctx.params;
    const parsed = investorProfileSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);
    await updateInvestorProfile(id, parsed.data, user.id, clientIp(req));
    return json({ ok: true });
  });
}
