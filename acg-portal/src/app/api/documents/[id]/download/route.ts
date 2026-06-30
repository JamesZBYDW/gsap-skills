import { NextRequest } from 'next/server';
import { handle, errorJson, clientIp } from '@/lib/http';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { formatUSD, formatRate } from '@/lib/money';
import { verifyDocumentToken, sampleDocumentBody } from '@/lib/documents';
import { audit } from '@/lib/audit';

// Access-controlled download. Authorized either by an authenticated session
// (investor owns the doc, or any team member) OR a valid short-lived signed
// token. Never public.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    const doc = await prisma.document.findUnique({
      where: { id },
      include: { investor: { include: { note: true } } },
    });
    if (!doc) return errorJson('Not found.', 404);

    // Authorization: signed token OR session ownership/team.
    let actorUserId: string | null = null;
    let authorized = verifyDocumentToken(id, token);
    if (!authorized) {
      const user = await getSessionUser();
      if (user) {
        actorUserId = user.id;
        authorized = user.role === 'TEAM' || user.investorId === doc.investorId;
      }
    }
    if (!authorized) return errorJson('Not authorized.', 403);

    await audit({
      action: 'DOCUMENT_DOWNLOAD',
      actorUserId,
      targetType: 'Document',
      targetId: id,
      ip: clientIp(req),
    });

    const note = doc.investor.note;
    const terms = note
      ? `Principal: ${formatUSD(note.principalCents)}  ·  Fixed rate ${formatRate(note.rateBps)}  ·  Term ${note.termMonths} months`
      : '';
    const body = sampleDocumentBody({ name: doc.name, investorName: doc.investor.legalName, terms });
    const filename = doc.name.replace(/[^\w]+/g, '_') + '.txt';

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  });
}
