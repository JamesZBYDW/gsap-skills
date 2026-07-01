import { NextRequest } from 'next/server';
import { handle, json, clientIp, assertSameOrigin } from '@/lib/http';
import { logout } from '@/lib/auth';

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    await logout(clientIp(req));
    return json({ ok: true });
  });
}
