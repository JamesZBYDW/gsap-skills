// Probe Worker for test/password.workerd.test.ts: runs the app's password
// module inside workerd (nodejs_compat) and reports results and timings.
import { hashPassword, verifyPassword } from '../../src/lib/password-core';

export default {
  async fetch(req: Request): Promise<Response> {
    const { pw, nodeHash } = (await req.json()) as { pw: string; nodeHash: string };
    const t0 = Date.now();
    const hash = await hashPassword(pw);
    const hashMs = Date.now() - t0;
    const t1 = Date.now();
    const ok = await verifyPassword(hash, pw);
    const verifyMs = Date.now() - t1;
    const wrong = await verifyPassword(hash, `${pw}!`);
    const nodeOk = await verifyPassword(nodeHash, pw);
    const nodeWrong = await verifyPassword(nodeHash, 'nope');
    return Response.json({ hash, ok, wrong, nodeOk, nodeWrong, hashMs, verifyMs });
  },
};
