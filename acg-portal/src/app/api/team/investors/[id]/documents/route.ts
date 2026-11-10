import { apiRequireTeamWrite } from '@/lib/team-write';
import type { NextRequest } from 'next/server';
import { apiRequireTeam } from '@/lib/auth';
import { assertSameOrigin, clientIp, handle, HttpError } from '@/lib/http';
import { db } from '@/server/db/client';
import { investorExists } from '@/server/db/repo';
import { documentBucket, uploadDocument } from '@/server/document-storage';
import { getDocuments, toDocumentVM } from '@/server/portal';

const privateHeaders = { 'Cache-Control': 'private, no-store' };

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await apiRequireTeam();
    const { id } = await ctx.params;
    if (!(await investorExists(db(), id))) throw new HttpError(404, 'Investor not found.');
    return Response.json({ documents: await getDocuments(id) }, { headers: privateHeaders });
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await apiRequireTeamWrite();
    const { id } = await ctx.params;
    const document = await uploadDocument(db(), documentBucket(), req, id, user.id, clientIp(req));
    return Response.json({ document: toDocumentVM(document) }, { status: 201, headers: privateHeaders });
  });
}
