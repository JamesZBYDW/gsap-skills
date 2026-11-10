// scrypt passwords in BOTH runtimes that use them: Node (admin-bootstrap CLI)
// and workerd (the Worker). The same module is bundled and run inside workerd
// via Miniflare with nodejs_compat, and hashes are checked across runtimes.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unstable_startWorker } from 'wrangler';
import { resolve } from 'node:path';
import { hashPassword, verifyPassword, parseHash, needsRehash } from '@/lib/password-core';

const PW = 'Correct horse 2026 battery';
let worker: Awaited<ReturnType<typeof unstable_startWorker>>;

beforeAll(async () => {
  worker = await unstable_startWorker({
    name: 'password-check',
    entrypoint: resolve(__dirname, 'support/password-worker.ts'),
    compatibilityDate: '2026-10-20',
    compatibilityFlags: ['nodejs_compat'],
    dev: { server: { hostname: '127.0.0.1', port: 0 }, inspector: false },
  });
  await worker.ready;
}, 120_000);
afterAll(async () => worker?.dispose());

describe('scrypt passwords (Node)', () => {
  it('round-trips, rejects wrong passwords and embeds its parameters', async () => {
    const h = await hashPassword(PW);
    expect(h).toMatch(/^scrypt\$ln=15,r=8,p=3\$/);
    expect(await verifyPassword(h, PW)).toBe(true);
    expect(await verifyPassword(h, PW + ' ')).toBe(false);
    expect(await hashPassword(PW)).not.toBe(h); // random salt
    expect(needsRehash(h)).toBe(false);
  });

  it('refuses malformed or out-of-range hashes without heavy work', async () => {
    const h = await hashPassword(PW);
    expect(parseHash(h.replace('ln=15', 'ln=24'))).toBeNull(); // would need 2 GiB
    expect(await verifyPassword(h.replace('ln=15', 'ln=24'), PW)).toBe(false);
    expect(await verifyPassword('$argon2id$v=19$m=19456,t=2,p=1$abc$def', PW)).toBe(false);
    expect(await verifyPassword('', PW)).toBe(false);
  });
});

describe('scrypt passwords (workerd runtime)', () => {
  it('hashes and verifies inside workerd, and accepts hashes made by the Node CLI', async () => {
    const nodeHash = await hashPassword(PW);
    const res = await worker.fetch('http://worker/', { method: 'POST', body: JSON.stringify({ pw: PW, nodeHash }) });
    expect(res.status).toBe(200);
    const r = (await res.json()) as Record<string, unknown>;
    expect(r.ok).toBe(true);
    expect(r.wrong).toBe(false);
    expect(r.nodeOk).toBe(true);
    expect(r.nodeWrong).toBe(false);
    // …and the reverse: Node verifies the hash workerd produced.
    expect(await verifyPassword(String(r.hash), PW)).toBe(true);
    console.log(`workerd scrypt N=2^15 r=8 p=3: hash ${r.hashMs} ms, verify ${r.verifyMs} ms (local; production checked live by Codex)`);
  }, 60_000);
});
