/* eslint-disable no-console */
// Create (or reset the password of) a Team Console login, without seeding.
//
//   npm run admin:create -- --remote --email <admin@example.com> --name "<Full Name>"
//   npm run admin:create -- --local  --email <admin@example.com> --name "<Full Name>"
//
// The password is read from the terminal with echo off (or from stdin when it
// is piped, for automation) and is never printed, logged, written to disk or
// passed on a command line. Only its scrypt hash leaves this process, as an
// argument to `wrangler d1 execute`, whose output is not shown.
//
// Re-running with the same email resets that login's password, clears any
// lockout and ends its sessions. An email that belongs to an investor login
// is refused.

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { hashPassword, passwordPolicyError } from '../src/lib/password-core';

const DB_NAME = 'acg-portal-production';
const ADMIN_MIN_LENGTH = 12;

function fail(message: string, code = 1): never {
  console.error(`create-admin: ${message}`);
  process.exit(code);
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const remote = process.argv.includes('--remote');
const local = process.argv.includes('--local');
if (remote === local) fail('pass exactly one of --remote (production D1) or --local.', 2);

// Local only: point at a specific local D1 state directory (tests).
const persistTo = argValue('--persist-to');
if (persistTo && remote) fail('--persist-to only applies to --local.', 2);
const persistArgs = persistTo ? ['--persist-to', persistTo] : [];

const email = (argValue('--email') ?? '').trim().toLowerCase();
const name = (argValue('--name') ?? '').trim();
// Restrictive on purpose: these are embedded as SQL literals below.
if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) fail('--email must be a plain email address.', 2);
if (!/^[\p{L}\p{M} .'-]{1,80}$/u.test(name)) fail('--name must be 1–80 letters, spaces, dots, apostrophes or hyphens.', 2);

/** Read a line without echoing it. Falls back to plain stdin when piped. */
function readSecret(prompt: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      let data = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (c) => (data += c));
      stdin.on('end', () => resolve(data.split(/\r?\n/)[0] ?? ''));
    });
  }
  return new Promise((resolve, reject) => {
    process.stderr.write(prompt);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          cleanup();
          process.stderr.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          cleanup();
          process.stderr.write('\n');
          reject(new Error('cancelled'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on('data', onData);
  });
}

const lit = (v: string | number | null) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`);

function d1(command: string, json = false): string {
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB_NAME, remote ? '--remote' : '--local', ...persistArgs, ...(json ? ['--json'] : []), '--command', command],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
  );
  if (r.status !== 0) fail('wrangler d1 execute failed (check `wrangler login` and the database name).');
  return r.stdout;
}

async function main() {
  const password = await readSecret(`Password for ${email} (input hidden): `);
  const problem = passwordPolicyError(password);
  if (problem) fail(problem);
  if (password.length < ADMIN_MIN_LENGTH) fail(`Admin passwords must be at least ${ADMIN_MIN_LENGTH} characters.`);
  if (process.stdin.isTTY) {
    const again = await readSecret('Repeat password: ');
    if (again !== password) fail('Passwords do not match.');
  }

  const hash = await hashPassword(password);
  const now = Date.now();
  const id = randomUUID();

  // One execution: create-or-reset (TEAM only), end the account's sessions
  // when it was reset, and record the bootstrap in the audit log.
  const sql = [
    `INSERT INTO users (id, role, name, email, password_hash, failed_login_attempts, locked_until, must_change_password, created_at, updated_at)
     VALUES (${lit(id)}, 'TEAM', ${lit(name)}, ${lit(email)}, ${lit(hash)}, 0, NULL, 0, ${now}, ${now})
     ON CONFLICT (email) DO UPDATE SET name = excluded.name, password_hash = excluded.password_hash,
       failed_login_attempts = 0, locked_until = NULL, must_change_password = 0, updated_at = excluded.updated_at
     WHERE users.role = 'TEAM'`,
    // Every session of that login ends, including any opened while this ran.
    `DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ${lit(email)} AND role = 'TEAM' AND password_hash = ${lit(hash)})`,
    `INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, metadata, ip, created_at)
     SELECT ${lit(randomUUID())}, NULL, 'ADMIN_BOOTSTRAP', 'User', id, json_object('via', 'cli'), NULL, ${now}
     FROM users WHERE email = ${lit(email)} AND role = 'TEAM' AND password_hash = ${lit(hash)}`,
  ].join(';\n');
  d1(sql);

  const out = d1(`SELECT role, password_hash = ${lit(hash)} AS applied, id = ${lit(id)} AS created FROM users WHERE email = ${lit(email)}`, true);
  const result = (JSON.parse(out) as Array<{ results: Array<{ role: string; applied: number; created: number }> }>)[0]?.results[0];
  if (!result) fail('the login was not written.');
  if (result.role !== 'TEAM') fail(`${email} belongs to an investor login; nothing was changed.`);
  if (!result.applied) fail('the password was not applied.');
  console.log(`Team login ${result.created ? 'created' : 'updated'}: ${email} (${remote ? 'production' : 'local'} D1)`);
}

main().catch((e) => fail(e instanceof Error ? e.message : 'unexpected error'));
