import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshD1 } from './support/d1';
import type { D1Database } from '@/server/db/d1';

let db: D1Database; let dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await freshD1()));
afterAll(async () => dispose?.());

describe('local D1', () => {
  it('has the migrated schema', async () => {
    const r = await db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'audit_logs'").first<{ n: number }>();
    expect(r?.n).toBe(1);
  });
});
