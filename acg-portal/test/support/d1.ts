// A real local D1 (the SQLite engine workerd uses) for integration tests:
// migrations are applied with wrangler, exactly as in production, into a
// throwaway persistence directory, then exposed via getPlatformProxy.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { getPlatformProxy } from 'wrangler';
import type { D1Database } from '@/server/db/d1';
import type { DocumentBucket } from '@/server/document-storage';

const root = resolve(__dirname, '..', '..');

type TestDocumentBucket = DocumentBucket & { list(): Promise<{ objects: { key: string }[] }> };

export async function freshD1(): Promise<{ db: D1Database; bucket: TestDocumentBucket; dispose: () => Promise<void> }> {
  const dir = mkdtempSync(join(tmpdir(), 'acg-d1-test-'));
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'migrations', 'apply', 'acg-portal-production', '--local', '--persist-to', dir],
    { cwd: root, encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(`migrations failed: ${r.stderr}`);
  const proxy = await getPlatformProxy<{ DB: D1Database; DOCUMENTS: TestDocumentBucket }>({
    configPath: join(root, 'wrangler.jsonc'),
    persist: { path: join(dir, 'v3') },
  });
  return {
    db: proxy.env.DB,
    bucket: proxy.env.DOCUMENTS,
    dispose: async () => {
      await proxy.dispose();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
