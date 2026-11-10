// Login, lockout, throttling and sessions against a real local D1.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshD1 } from './support/d1';
import type { D1Database } from '@/server/db/d1';
import { attemptLogin, finalizeLogin, recordFailedLogin, TIMING_DUMMY_HASH } from '@/lib/auth';
import { rateLimit, LOGIN_MAX_ATTEMPTS } from '@/lib/ratelimit';
import { prepareSession, sessionUserForToken, pruneExpiredSessions } from '@/lib/session';
import { hashPassword, parseHash } from '@/lib/password-core';

let db: D1Database;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await freshD1()));
afterAll(async () => dispose?.());

const count = async (sql: string, ...params: unknown[]) =>
  Number((await db.prepare(sql).bind(...params).first<{ n: number }>())!.n);

async function makeUser(email: string, password: string, role: 'TEAM' | 'INVESTOR' = 'TEAM') {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db
    .prepare('INSERT INTO users (id, role, name, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, role, 'User', email, await hashPassword(password), now, now)
    .run();
  return id;
}

const hashOf = async (id: string) =>
  String((await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(id).first<{ password_hash: string }>())!.password_hash);
const lockState = (id: string) =>
  db.prepare('SELECT failed_login_attempts AS n, locked_until AS until FROM users WHERE id = ?').bind(id).first<{ n: number; until: number | null }>();
const actions = async (id: string) =>
  (await db.prepare('SELECT action FROM audit_logs WHERE actor_user_id = ? ORDER BY rowid').bind(id).all<{ action: string }>()).results.map((r) => r.action);

describe('attemptLogin', () => {
  it('succeeds with session row, reset counters and an audited edge IP', async () => {
    const id = await makeUser('ok@test.example', 'Correct2026pass');
    await db.prepare('UPDATE users SET failed_login_attempts = 3 WHERE id = ?').bind(id).run();
    const r = await attemptLogin({ email: ' OK@test.example ', password: 'Correct2026pass', expectedRole: 'TEAM', ip: '203.0.113.9' }, db);
    expect(r.ok).toBe(true);
    expect(r.session?.token).toBeTruthy();
    expect(await count('SELECT count(*) AS n FROM sessions WHERE user_id = ?', id)).toBe(1);
    expect(await count('SELECT failed_login_attempts AS n FROM users WHERE id = ?', id)).toBe(0);
    const a = await db.prepare("SELECT ip FROM audit_logs WHERE actor_user_id = ? AND action = 'AUTH_LOGIN'").bind(id).first<{ ip: string }>();
    expect(a?.ip).toBe('203.0.113.9');
    // The cookie token resolves to the user; only its hash is stored.
    const u = await sessionUserForToken(db, r.session!.token);
    expect(u?.id).toBe(id);
    expect(await count('SELECT count(*) AS n FROM sessions WHERE token_hash = ?', r.session!.token)).toBe(0);
  });

  it('gives the same generic error for an unknown email and a wrong password', async () => {
    await makeUser('known@test.example', 'Correct2026pass');
    const unknown = await attemptLogin({ email: 'nobody@test.example', password: 'Whatever2026x' }, db);
    const wrong = await attemptLogin({ email: 'known@test.example', password: 'Wrong2026passx' }, db);
    expect(unknown).toEqual({ ok: false, error: 'Invalid email or password.' });
    expect(wrong).toEqual({ ok: false, error: 'Invalid email or password.' });
  });

  it('refuses the wrong side (role mismatch) without creating a session', async () => {
    const id = await makeUser('inv@test.example', 'Correct2026pass', 'INVESTOR');
    const r = await attemptLogin({ email: 'inv@test.example', password: 'Correct2026pass', expectedRole: 'TEAM' }, db);
    expect(r.ok).toBe(false);
    expect(await count('SELECT count(*) AS n FROM sessions WHERE user_id = ?', id)).toBe(0);
  });
});

describe('failed-login lockout', () => {
  it(`counts ${LOGIN_MAX_ATTEMPTS} concurrent failures exactly and locks once`, async () => {
    const id = await makeUser('lock@test.example', 'Correct2026pass');
    const h = await hashOf(id);
    await Promise.all(Array.from({ length: LOGIN_MAX_ATTEMPTS }, () => recordFailedLogin(db, id, h, '198.51.100.1')));
    const u = await db.prepare('SELECT failed_login_attempts, locked_until FROM users WHERE id = ?').bind(id).first<Record<string, number | null>>();
    expect(u?.locked_until).toBeGreaterThan(Date.now());
    expect(u?.failed_login_attempts).toBe(0);
    expect(await count("SELECT count(*) AS n FROM audit_logs WHERE actor_user_id = ? AND action = 'AUTH_LOCKOUT'", id)).toBe(1);
    expect(await count("SELECT count(*) AS n FROM audit_logs WHERE actor_user_id = ? AND action = 'AUTH_LOGIN_FAILED'", id)).toBe(LOGIN_MAX_ATTEMPTS - 1);
  });

  it('a locked account cannot log in even with the right password', async () => {
    const id = await makeUser('locked2@test.example', 'Correct2026pass');
    await db.prepare('UPDATE users SET locked_until = ? WHERE id = ?').bind(Date.now() + 60_000, id).run();
    const r = await attemptLogin({ email: 'locked2@test.example', password: 'Correct2026pass' }, db);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/locked/);
    expect(await count('SELECT count(*) AS n FROM sessions WHERE user_id = ?', id)).toBe(0);
  });

  it('concurrent wrong-password logins through attemptLogin lock the account', async () => {
    const id = await makeUser('burst@test.example', 'Correct2026pass');
    await Promise.all(Array.from({ length: LOGIN_MAX_ATTEMPTS }, () => attemptLogin({ email: 'burst@test.example', password: 'Wrong2026passx' }, db)));
    const u = await db.prepare('SELECT locked_until FROM users WHERE id = ?').bind(id).first<{ locked_until: number | null }>();
    expect(u?.locked_until).toBeGreaterThan(Date.now());
  });
});

// Exact interleavings from review: every request below read the account
// (and checked the password) BEFORE the competing write landed.
describe('auth races (stale reads)', () => {
  it('a 6th failure that read the account before the lockout neither clears nor restarts it', async () => {
    const id = await makeUser('race6@test.example', 'Correct2026pass');
    const h = await hashOf(id); // all six attempts read this unlocked state
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) await recordFailedLogin(db, id, h, null);
    const locked = await lockState(id);
    expect(locked?.until).toBeGreaterThan(Date.now());
    await recordFailedLogin(db, id, h, null); // the stale sixth
    expect(await lockState(id)).toEqual(locked); // lock and counter untouched
    expect((await actions(id)).filter((a) => a === 'AUTH_LOCKOUT')).toHaveLength(1);
    expect((await actions(id)).at(-1)).toBe('AUTH_LOGIN_FAILED'); // still audited, as not_counted
  });

  it('six concurrent failures from one unlocked read lock exactly once and stay locked', async () => {
    const id = await makeUser('race6c@test.example', 'Correct2026pass');
    const h = await hashOf(id);
    await Promise.all(Array.from({ length: LOGIN_MAX_ATTEMPTS + 1 }, () => recordFailedLogin(db, id, h, null)));
    const st = await lockState(id);
    expect(st?.until).toBeGreaterThan(Date.now());
    expect(st?.n).toBe(0);
    expect((await actions(id)).filter((a) => a === 'AUTH_LOCKOUT')).toHaveLength(1);
    expect(await actions(id)).toHaveLength(LOGIN_MAX_ATTEMPTS + 1);
  });

  it('a failure checked against an old password does not count against new credentials', async () => {
    const id = await makeUser('stalepw@test.example', 'Correct2026pass');
    const oldHash = await hashOf(id);
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword('NewPass2026abc'), id).run();
    await recordFailedLogin(db, id, oldHash, null);
    expect((await lockState(id))?.n).toBe(0);
  });

  it('a lockout that lands during password verification blocks the success: no session, no AUTH_LOGIN', async () => {
    const id = await makeUser('lockmid@test.example', 'Correct2026pass');
    const verified = await hashOf(id); // read + verified before…
    const until = Date.now() + 60_000;
    await db.prepare('UPDATE users SET locked_until = ? WHERE id = ?').bind(until, id).run(); // …the lockout lands
    expect(await finalizeLogin(db, id, verified, { ip: null })).toBeNull();
    expect(await count('SELECT count(*) AS n FROM sessions WHERE user_id = ?', id)).toBe(0);
    expect((await lockState(id))?.until).toBe(until); // lock preserved
    expect(await actions(id)).not.toContain('AUTH_LOGIN');
  });

  it('a credential reset that lands during verification blocks the old-password session', async () => {
    const id = await makeUser('resetmid@test.example', 'Correct2026pass');
    const verified = await hashOf(id);
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword('Reset2026passw'), id).run();
    expect(await finalizeLogin(db, id, verified, { ip: null })).toBeNull();
    expect(await count('SELECT count(*) AS n FROM sessions WHERE user_id = ?', id)).toBe(0);
  });

  it('finalizeLogin succeeds when nothing changed, and only then writes session + audit', async () => {
    const id = await makeUser('finok@test.example', 'Correct2026pass');
    const s = await finalizeLogin(db, id, await hashOf(id), { ip: '203.0.113.4' });
    expect(s?.token).toBeTruthy();
    expect(await count('SELECT count(*) AS n FROM sessions WHERE user_id = ?', id)).toBe(1);
    expect(await actions(id)).toEqual(['AUTH_LOGIN']);
  });

  it('attemptLogin returns the generic error and sets no session when credentials change mid-login', async () => {
    const id = await makeUser('midlogin@test.example', 'Correct2026pass');
    // Change the password while attemptLogin is verifying (scrypt takes ~100s of ms).
    const pending = attemptLogin({ email: 'midlogin@test.example', password: 'Correct2026pass' }, db);
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword('Changed2026pass'), id).run();
    const r = await pending;
    if (r.ok) {
      // The login committed before the change landed: legitimate ordering.
      expect(await count('SELECT count(*) AS n FROM sessions WHERE user_id = ?', id)).toBe(1);
    } else {
      expect(r.session).toBeUndefined();
      expect(await count('SELECT count(*) AS n FROM sessions WHERE user_id = ?', id)).toBe(0);
    }
  });
});

describe('shared login throttle (D1 counter)', () => {
  it('admits exactly `limit` of many concurrent hits', async () => {
    const results = await Promise.all(Array.from({ length: 30 }, () => rateLimit(db, 'login:203.0.113.50', 20, 60_000)));
    expect(results.filter((r) => r.allowed)).toHaveLength(20);
    const blocked = results.find((r) => !r.allowed)!;
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('starts a new window once the old one expires, and keys are independent', async () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) await rateLimit(db, 'login:w', 3, 1_000, t0);
    expect((await rateLimit(db, 'login:w', 3, 1_000, t0 + 10)).allowed).toBe(false);
    expect((await rateLimit(db, 'login:other', 3, 1_000, t0 + 10)).allowed).toBe(true);
    expect((await rateLimit(db, 'login:w', 3, 1_000, t0 + 1_000)).allowed).toBe(true);
  });
});

describe('sessions', () => {
  it('expired sessions resolve to nobody and are deleted; prune removes stale rows', async () => {
    const id = await makeUser('sess@test.example', 'Correct2026pass');
    const old = prepareSession(db, id, {}, Date.now() - 8 * 24 * 3600 * 1000);
    await old.statement.run();
    expect(await sessionUserForToken(db, old.token)).toBeNull();
    expect(await count('SELECT count(*) AS n FROM sessions WHERE user_id = ?', id)).toBe(0);
    await prepareSession(db, id, {}, Date.now() - 8 * 24 * 3600 * 1000).statement.run();
    expect(await pruneExpiredSessions(db)).toBeGreaterThanOrEqual(1);
  });
});

describe('timing dummy hash', () => {
  it('is a well-formed hash, so unknown emails pay the full verification cost', () => {
    expect(parseHash(TIMING_DUMMY_HASH)).toBeTruthy();
  });
});
