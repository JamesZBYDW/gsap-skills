import type { NextRequest } from 'next/server';
import { handle, clientIp } from '@/lib/http';
import { getSessionUser } from '@/lib/session';
import { db } from '@/server/db/client';
import { documentBucket, downloadDocument } from '@/server/document-storage';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    return downloadDocument(db(), documentBucket(), id, req.nextUrl.searchParams.get('token'), await getSessionUser(), clientIp(req));
  });
}
