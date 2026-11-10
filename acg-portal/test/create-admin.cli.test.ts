// End-to-end test of scripts/create-admin.ts against a throwaway LOCAL D1:
// the CLI is run as an operator would (password on stdin, never on argv).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const root = resolve(__dirname, '..');
const DB = 'acg-portal-production';
let dir: string;

const wrangler = (...args: string[]) =>
  spawnSync('npx', ['wrangler', 'd1', ...args, '--local', '--persist-to', dir], { cwd: root, encoding: 'utf8' });
const sql = <T = Record<string, unknown>>(command: string): T[] => {
  const r = wrangler('execute', DB, '--json', '--command', command);
  if (r.status !== 0) throw new Error(r.stderr);
  return (JSON.parse(r.stdout) as Array<{ results: T[] }>)[0]!.results;
};
const admin = (email: string, name: string, password: string, extra: string[] = []) =>
  spawnSync('npx', ['tsx', 'scripts/create-admin.ts', '--local', '--persist-to', dir, '--email', email, '--name', name, ...extra], {
    cwd: root,
    input: `${password}\n`,
    encoding: 'utf8',
  });

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'acg-admin-cli-'));
  const r = wrangler('migrations', 'apply', DB);
  if (r.status !== 0) throw new Error(r.stderr);
}, 120_000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('create-admin CLI', () => {
  const PW = 'Bootstrap2026passphrase';

  it('creates a TEAM login without ever printing the password or its hash', () => {
    const r = admin('Admin@Example.com', 'Admin Person', PW);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Team login created: admin@example.com \(local D1\)/);
    const [u] = sql<{ role: string; password_hash: string; must_change_password: number }>(
      "SELECT role, password_hash, must_change_password FROM users WHERE email = 'admin@example.com'",
    );
    expect(u?.role).toBe('TEAM');
    expect(u?.password_hash).toMatch(/^scrypt\$ln=15,r=8,p=3\$/);
    for (const text of [r.stdout, r.stderr]) {
      expect(text).not.toContain(PW);
      expect(text).not.toContain(u!.password_hash);
    }
    expect(sql("SELECT action FROM audit_logs WHERE action = 'ADMIN_BOOTSTRAP'")).toHaveLength(1);
  }, 120_000);

  it('a reset ends ALL sessions of that login, including ones created while it ran', () => {
    const [u] = sql<{ id: string }>("SELECT id FROM users WHERE email = 'admin@example.com'");
    const future = Date.now() + 60 * 60 * 1000; // "created during wrangler startup"
    sql(
      `INSERT INTO sessions (id, token_hash, user_id, expires_at, created_at) VALUES
       ('s-old', 'h-old', '${u!.id}', ${future + 1}, 1), ('s-new', 'h-new', '${u!.id}', ${future + 1}, ${future})`,
    );
    const r = admin('admin@example.com', 'Admin Person', 'Rotated2026passphrase');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Team login updated/);
    expect(sql(`SELECT id FROM sessions WHERE user_id = '${u!.id}'`)).toHaveLength(0);
  }, 120_000);

  it('refuses an email that belongs to an investor login and changes nothing', () => {
    sql(
      `INSERT INTO users (id, role, name, email, password_hash, created_at, updated_at)
       VALUES ('inv-1', 'INVESTOR', 'Inv', 'investor@example.com', 'scrypt$keep', 1, 1)`,
    );
    const r = admin('investor@example.com', 'Someone', PW);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/belongs to an investor login/);
    expect(sql("SELECT password_hash FROM users WHERE id = 'inv-1'")).toEqual([{ password_hash: 'scrypt$keep' }]);
  }, 120_000);

  it('rejects weak passwords, a missing target, and remote seeding-style misuse', () => {
    expect(admin('a@example.com', 'A', 'short1').stderr).toMatch(/at least/);
    const noTarget = spawnSync('npx', ['tsx', 'scripts/create-admin.ts', '--email', 'a@example.com', '--name', 'A'], { cwd: root, input: `${PW}\n`, encoding: 'utf8' });
    expect(noTarget.status).toBe(2);
    expect(noTarget.stderr).toMatch(/exactly one of --remote/);
    const both = spawnSync('npx', ['tsx', 'scripts/create-admin.ts', '--remote', '--persist-to', dir, '--email', 'a@example.com', '--name', 'A'], { cwd: root, input: `${PW}\n`, encoding: 'utf8' });
    expect(both.stderr).toMatch(/only applies to --local/);
  }, 120_000);
});

describe('seed-local script', () => {
  it('refuses any remote target', () => {
    const r = spawnSync('npx', ['tsx', 'scripts/seed-local.ts', '--remote'], { cwd: root, encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/only ever targets the local D1/);
  }, 60_000);
});
