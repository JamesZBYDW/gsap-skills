import { apiRequireTeamWrite } from '@/lib/team-write';
import { apiRequireTeam } from '@/lib/auth';
import { assertSameOrigin, clientIp, handle } from '@/lib/http';
import { getPaymentSchedule, recordDistributionPayment } from '@/server/payments';

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Context) {
  return handle(async () => {
    await apiRequireTeam();
    const { id } = await ctx.params;
    return Response.json(await getPaymentSchedule(id), { headers: { 'Cache-Control': 'private, no-store' } });
  });
}

export async function POST(req: Request, ctx: Context) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await apiRequireTeamWrite();
    const { id } = await ctx.params;
    const result = await recordDistributionPayment(id, await req.json().catch(() => null), actor.id, clientIp(req));
    return Response.json(result, { status: result.recorded ? 201 : 200 });
  });
}
