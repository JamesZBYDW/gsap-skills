import { NextRequest } from 'next/server';
import { handle, json, errorJson, clientIp, assertSameOrigin } from '@/lib/http';
import { prisma } from '@/lib/db';
import { registerSchema } from '@/lib/validation';
import { deriveRateBps } from '@/lib/rates';
import { parseMoneyToCents } from '@/lib/money';
import { audit } from '@/lib/audit';
import { rateLimit } from '@/lib/ratelimit';

// Public "Request access" front door. Creates a PENDING registration that lands
// in the team Registrations queue. We do NOT create a login here — the team
// approves first (compliance: accredited-investor review before access).
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const ip = clientIp(req);

    const limit = rateLimit(`register:${ip ?? 'unknown'}`, 10, 1000 * 60 * 10);
    if (!limit.allowed) {
      return errorJson('Too many submissions. Please try again later.', 429);
    }

    const parsed = registerSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return errorJson(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);
    }

    const { name, email, type, principal, termMonths, acknowledgedAccredited } = parsed.data;
    const intendedPrincipalCents = principal ? parseMoneyToCents(principal) : null;

    const registration = await prisma.registration.create({
      data: {
        name,
        email: email.toLowerCase(),
        type,
        intendedPrincipalCents,
        termMonths,
        derivedRateBps: deriveRateBps(termMonths),
        status: 'PENDING',
        acknowledgedAccredited,
      },
    });

    await audit({
      action: 'REGISTRATION_SUBMIT',
      targetType: 'Registration',
      targetId: registration.id,
      metadata: { email: email.toLowerCase(), termMonths },
      ip,
    });

    return json({ ok: true });
  });
}
