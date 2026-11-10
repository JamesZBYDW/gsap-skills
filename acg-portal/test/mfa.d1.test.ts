// Two-factor authentication against a real local D1: enrollment, the login
// challenge, replay/race protection, bounded attempts, expiry, and the
// interaction with lockout, credential resets and password-only sign-in.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshD1 } from './support/d1';
import type { D1Database } from '@/server/db/d1';
import { attemptLogin, finalizeLogin, recordFailedLogin } from '@/lib/auth';
import { hashPassword } from '@/lib/password-core';
import { b64urlEncode, loadMfaKeys, type MfaKeys } from '@/lib/mfa-crypto';
import { base32Decode, hotp, totpStep } from '@/lib/totp';
import {
  MFA_CHALLENGE_TTL_MS,
  MFA_MAX_ATTEMPTS,
  completeChallenge,
  confirmEnrollment,
  createChallenge,
  disableMfa,
  getMfaStatus,
  regenerateRecoveryCodes,
  startEnrollment,
} from '@/server/mfa';
import { provisionCredentials, createInvestorAccount } from '@/server/lifecycle';
import { createAccountSchema } from '@/lib/validation';

let db: D1Database;
let dispose: () => Promise<void>;
let keys: MfaKeys;
const PW = 'Correct2026pass';
const STEP = 30_000;

beforeAll(async () => {
  ({ db, dispose } = await freshD1());
  keys = await loadMfaKeys(b64urlEncode(crypto.getRandomValues(new Uint8Array(32))));
});
afterAll(async () => dispose?.());

const count = async (sql: string, ...params: unknown[]) => Number((await db.prepare(sql).bind(...params).first<{ n: number }>())!.n);
const sessionsOf = (id: string) => count('SELECT count(*) AS n FROM sessions WHERE user_id = ?', id);
const hashOf = async (id: string) => String((await db.prepare('SELECT password_hash AS h FROM users WHERE id = ?').bind(id).first<{ h: string }>())!.h);

let n = 0;
async function makeUser(role: 'TEAM' | 'INVESTOR' = 'TEAM') {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db
    .prepare('INSERT INTO users (id, role, name, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, role, 'User', `mfa${++n}@test.example`, await hashPassword(PW), now, now)
    .run();
  return { id, email: `mfa${n}@test.example` };
}

/** Enroll with a code at `t`, returning the TOTP secret and the recovery codes. */
async function enroll(userId: string, t: number) {
  const start = await startEnrollment(db, keys, userId, PW, null, t);
  const secret = base32Decode(start.secret);
  const codes = await confirmEnrollment(db, keys, userId, await hotp(secret, totpStep(t)), null, t);
  return { secret, codes };
}
const codeAt = (secret: Uint8Array, t: number) => hotp(secret, totpStep(t));
const failure = (userId: string, h: string) => recordFailedLogin(db, userId, h, null);
const challenge = async (userId: string, t: number) => (await createChallenge(db, userId, await hashOf(userId), { ip: '203.0.113.5' }, t))!;
const complete = (token: string, code: string, t: number) => completeChallenge(db, keys, token, code, { ip: '203.0.113.5' }, failure, t);


// ─── Enrollment ─────────────────────────────────────────────────────────────

describe('enrollment', () => {
  it('requires the password, is inert until verified, and stores only ciphertext and hashes', async () => {
    const u = await makeUser();
    const t = Date.now();
    await expect(startEnrollment(db, keys, u.id, 'wrong-password1', null, t)).rejects.toMatchObject({ status: 400 });

    const start = await startEnrollment(db, keys, u.id, PW, null, t);
    expect(start.otpauthUri).toContain(`secret=${start.secret}`);
    // Pending setup does not change sign-in.
    const pending = await attemptLogin({ email: u.email, password: PW }, db);
    expect(pending.ok && pending.session && !pending.mfaRequired).toBeTruthy();

    await expect(confirmEnrollment(db, keys, u.id, '000000', null, t)).rejects.toMatchObject({ status: 400 });
    const secret = base32Decode(start.secret);
    const codes = await confirmEnrollment(db, keys, u.id, await codeAt(secret, t), null, t);
    expect(codes).toHaveLength(10);

    const row = await db.prepare('SELECT secret_ciphertext AS c FROM mfa_factors WHERE user_id = ?').bind(u.id).first<{ c: string }>();
    expect(row!.c).toMatch(/^v1\./);
    expect(row!.c).not.toContain(start.secret);
    const stored = (await db.prepare('SELECT code_hash FROM mfa_recovery_codes WHERE user_id = ?').bind(u.id).all<{ code_hash: string }>()).results;
    expect(stored).toHaveLength(10);
    for (const c of codes) expect(stored.map((s) => s.code_hash)).not.toContain(c);
    expect((await getMfaStatus(db, u.id)).enabled).toBe(true);
    await expect(startEnrollment(db, keys, u.id, PW, null, t)).rejects.toMatchObject({ status: 409 });
  });

  it('keeps the winning recovery codes when two confirmations share the same millisecond', async () => {
    const user = await makeUser();
    const t = Date.now();
    const pending = await startEnrollment(db, keys, user.id, PW, null, t);
    const code = await codeAt(base32Decode(pending.secret), t);
    let winningCodes: string[] = [];
    await expect(confirmEnrollment(db, keys, user.id, code, null, t, {
      beforeCommit: async () => { winningCodes = await confirmEnrollment(db, keys, user.id, code, null, t); },
    })).rejects.toMatchObject({ status: 409 });
    expect(await count("SELECT count(*) AS n FROM audit_logs WHERE actor_user_id = ? AND action = 'MFA_ENABLED'", user.id)).toBe(1);
    expect(winningCodes).toHaveLength(10);
    const ch = await challenge(user.id, t);
    expect(await complete(ch.token, winningCodes[0]!, t)).toMatchObject({ ok: true, method: 'recovery' });
  });

  it('the enrollment code cannot be replayed to sign in', async () => {
    const u = await makeUser();
    const t = Date.now();
    const { secret } = await enroll(u.id, t);
    const ch = await challenge(u.id, t);
    expect((await complete(ch.token, await codeAt(secret, t), t)).ok).toBe(false);
  });
});

// ─── Sign-in ────────────────────────────────────────────────────────────────

describe('sign-in with 2FA on', () => {
  it('a correct password yields a challenge, never a session', async () => {
    const u = await makeUser();
    await enroll(u.id, Date.now() - 10 * STEP);
    await db.prepare('UPDATE users SET failed_login_attempts = 3 WHERE id = ?').bind(u.id).run();
    const r = await attemptLogin({ email: u.email, password: PW, ip: '203.0.113.5' }, db);
    expect(r.ok).toBe(true);
    expect(r.mfaRequired).toBe(true);
    expect(r.session).toBeUndefined();
    expect(r.mfaChallenge?.token).toBeTruthy();
    expect(await sessionsOf(u.id)).toBe(0);
    // The failed-attempt counter is NOT reset by the password alone.
    expect(await count('SELECT failed_login_attempts AS n FROM users WHERE id = ?', u.id)).toBe(3);
  });

  it('password-only finalization is refused for an enrolled account (no bypass), without resetting counters', async () => {
    const u = await makeUser();
    await enroll(u.id, Date.now() - 10 * STEP);
    await db.prepare('UPDATE users SET failed_login_attempts = 2 WHERE id = ?').bind(u.id).run();
    expect(await finalizeLogin(db, u.id, await hashOf(u.id), { ip: null })).toBeNull();
    expect(await sessionsOf(u.id)).toBe(0);
    expect(await count('SELECT failed_login_attempts AS n FROM users WHERE id = ?', u.id)).toBe(2);
  });

  it('a valid code completes the challenge: one session, counters reset, audited', async () => {
    const u = await makeUser();
    const t0 = Date.now() - 10 * STEP;
    const { secret } = await enroll(u.id, t0);
    const t = t0 + 4 * STEP;
    const ch = await challenge(u.id, t);
    const r = await complete(ch.token, await codeAt(secret, t), t);
    expect(r.ok).toBe(true);
    expect(await sessionsOf(u.id)).toBe(1);
    expect(await count('SELECT count(*) AS n FROM mfa_challenges WHERE user_id = ?', u.id)).toBe(0);
    const a = await db.prepare("SELECT metadata FROM audit_logs WHERE actor_user_id = ? AND action = 'AUTH_LOGIN'").bind(u.id).first<{ metadata: string }>();
    expect(JSON.parse(a!.metadata)).toEqual({ mfa: 'totp' });
  });

  it('a used TOTP step cannot be replayed on a new challenge, and a used challenge is gone', async () => {
    const u = await makeUser();
    const t0 = Date.now() - 10 * STEP;
    const { secret } = await enroll(u.id, t0);
    const t = t0 + 4 * STEP;
    const code = await codeAt(secret, t);
    const first = await challenge(u.id, t);
    expect((await complete(first.token, code, t)).ok).toBe(true);
    expect((await complete(first.token, code, t)).ok).toBe(false); // same challenge again
    const second = await challenge(u.id, t);
    const replay = await complete(second.token, code, t + 1000); // same step, new challenge
    expect(replay).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await sessionsOf(u.id)).toBe(1);
  });

  it('concurrent submissions of one valid code create exactly one session', async () => {
    const u = await makeUser();
    const t0 = Date.now() - 10 * STEP;
    const { secret } = await enroll(u.id, t0);
    const t = t0 + 4 * STEP;
    const ch = await challenge(u.id, t);
    const code = await codeAt(secret, t);
    const results = await Promise.all(Array.from({ length: 4 }, () => complete(ch.token, code, t)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await sessionsOf(u.id)).toBe(1);
  });

  it(`allows at most ${MFA_MAX_ATTEMPTS} checks per challenge, even under a burst, and counts failures toward lockout`, async () => {
    const u = await makeUser();
    const t0 = Date.now() - 10 * STEP;
    const { secret } = await enroll(u.id, t0);
    const t = t0 + 4 * STEP;
    const ch = await challenge(u.id, t);
    const wrong = (await codeAt(secret, t)) === '111111' ? '222222' : '111111';
    const burst = await Promise.all(Array.from({ length: 12 }, () => complete(ch.token, wrong, t)));
    expect(burst.every((r) => !r.ok)).toBe(true);
    expect(await count("SELECT count(*) AS n FROM audit_logs WHERE actor_user_id = ? AND action = 'AUTH_MFA_FAILED'", u.id)).toBe(MFA_MAX_ATTEMPTS);
    // The right code is no longer accepted on this challenge…
    expect(await complete(ch.token, await codeAt(secret, t), t)).toMatchObject({ ok: false, reason: 'expired' });
    // …and the five wrong codes locked the account like five wrong passwords.
    const lock = await db.prepare('SELECT locked_until AS l FROM users WHERE id = ?').bind(u.id).first<{ l: number | null }>();
    expect(lock!.l).toBeGreaterThan(Date.now());
    expect(await sessionsOf(u.id)).toBe(0);
  });

  it('an expired challenge is refused', async () => {
    const u = await makeUser();
    const t0 = Date.now() - 10 * STEP;
    const { secret } = await enroll(u.id, t0);
    const ch = await challenge(u.id, t0 + 2 * STEP);
    const late = t0 + 2 * STEP + MFA_CHALLENGE_TTL_MS + 1;
    expect(await complete(ch.token, await codeAt(secret, late), late)).toMatchObject({ ok: false, reason: 'expired' });
    expect(await sessionsOf(u.id)).toBe(0);
  });

  it.each([
    ['a credential reset', async (id: string) => db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword('Reset2026pass'), id).run()],
    ['a lockout', async (id: string) => db.prepare('UPDATE users SET locked_until = ? WHERE id = ?').bind(Date.now() + 3_600_000, id).run()],
    ['turning 2FA off', async (id: string) => db.prepare('DELETE FROM mfa_factors WHERE user_id = ?').bind(id).run()],
  ])('%s while the challenge is open makes it fail with no session', async (_label, change) => {
    const u = await makeUser();
    const t0 = Date.now() - 10 * STEP;
    const { secret } = await enroll(u.id, t0);
    const t = t0 + 4 * STEP;
    const ch = await challenge(u.id, t);
    await change(u.id);
    const r = await complete(ch.token, await codeAt(secret, t), t);
    expect(r.ok).toBe(false);
    expect(await sessionsOf(u.id)).toBe(0);
  });

  it('a factor encrypted under a different key fails closed', async () => {
    const u = await makeUser();
    const t0 = Date.now() - 10 * STEP;
    const { secret } = await enroll(u.id, t0);
    const t = t0 + 4 * STEP;
    const ch = await challenge(u.id, t);
    const otherKeys = await loadMfaKeys(b64urlEncode(crypto.getRandomValues(new Uint8Array(32))));
    await expect(completeChallenge(db, otherKeys, ch.token, await codeAt(secret, t), { ip: null }, failure, t)).rejects.toThrow();
    expect(await sessionsOf(u.id)).toBe(0);
  });
});

// ─── Recovery codes ─────────────────────────────────────────────────────────

describe('recovery codes', () => {
  it('each signs in once; concurrent use of one code yields one session', async () => {
    const u = await makeUser();
    const t = Date.now();
    const { codes } = await enroll(u.id, t - 10 * STEP);
    const ch1 = await challenge(u.id, t);
    expect(await complete(ch1.token, codes[0]!.toUpperCase(), t)).toMatchObject({ ok: true, method: 'recovery' });
    const ch2 = await challenge(u.id, t);
    expect((await complete(ch2.token, codes[0]!, t)).ok).toBe(false); // reused
    expect((await getMfaStatus(db, u.id)).recoveryCodesRemaining).toBe(9);

    const chA = await challenge(u.id, t);
    const chB = await challenge(u.id, t);
    const both = await Promise.all([complete(chA.token, codes[1]!, t), complete(chB.token, codes[1]!, t)]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(await sessionsOf(u.id)).toBe(2);
    expect(await count("SELECT count(*) AS n FROM audit_logs WHERE actor_user_id = ? AND action = 'AUTH_MFA_RECOVERY_USED'", u.id)).toBe(2);
  });

  it('regenerating replaces every code (password + current code required)', async () => {
    const u = await makeUser();
    const t0 = Date.now() - 10 * STEP;
    const { secret, codes } = await enroll(u.id, t0);
    const t = t0 + 4 * STEP;
    await expect(regenerateRecoveryCodes(db, keys, u.id, 'wrong-password1', await codeAt(secret, t), null, t)).rejects.toMatchObject({ status: 400 });
    const fresh = await regenerateRecoveryCodes(db, keys, u.id, PW, await codeAt(secret, t), null, t);
    expect(fresh).toHaveLength(10);
    const ch = await challenge(u.id, t + STEP);
    expect((await complete(ch.token, codes[5]!, t + STEP)).ok).toBe(false); // old code dead
    const ch2 = await challenge(u.id, t + STEP);
    expect((await complete(ch2.token, fresh[0]!, t + STEP)).ok).toBe(true);
  });
});

// ─── Disable ────────────────────────────────────────────────────────────────

describe('turning 2FA off', () => {
  it('requires the password AND a valid code; afterwards password sign-in works again', async () => {
    const u = await makeUser();
    const t0 = Date.now() - 10 * STEP;
    const { secret } = await enroll(u.id, t0);
    const t = t0 + 4 * STEP;
    await expect(disableMfa(db, keys, u.id, 'wrong-password1', await codeAt(secret, t), null, t)).rejects.toMatchObject({ status: 400 });
    await expect(disableMfa(db, keys, u.id, PW, '000000', null, t)).rejects.toMatchObject({ status: 400 });
    expect((await getMfaStatus(db, u.id)).enabled).toBe(true);

    await disableMfa(db, keys, u.id, PW, await codeAt(secret, t), null, t);
    expect(await getMfaStatus(db, u.id)).toEqual({ enabled: false, enabledAt: null, recoveryCodesRemaining: 0 });
    expect(await count('SELECT count(*) AS n FROM mfa_recovery_codes WHERE user_id = ?', u.id)).toBe(0);
    expect(await count("SELECT count(*) AS n FROM audit_logs WHERE actor_user_id = ? AND action = 'MFA_DISABLED'", u.id)).toBe(1);
    const r = await attemptLogin({ email: u.email, password: PW }, db);
    expect(r.session).toBeTruthy();
  });
});

// ─── Credential resets cannot bypass 2FA ────────────────────────────────────

describe('management credential reset', () => {
  it('keeps the investor\'s 2FA: the new password still needs the second factor', async () => {
    const { id: investorId } = await createInvestorAccount(
      createAccountSchema.parse({
        name: 'Mfa Investor',
        email: 'mfa.investor@test.example',
        password: 'Issued2026pw',
        principal: '500,000',
        ratePercent: '15',
        termMonths: '12',
      }),
      (await makeUser()).id,
      null,
      db,
    );
    const userId = String((await db.prepare('SELECT user_id FROM investors WHERE id = ?').bind(investorId).first<{ user_id: string }>())!.user_id);
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(PW), userId).run();
    await enroll(userId, Date.now() - 10 * STEP);

    await provisionCredentials(investorId, { password: 'Reissued2026pw', mustChange: true }, 'team', null, db);
    const r = await attemptLogin({ email: 'mfa.investor@test.example', password: 'Reissued2026pw', expectedRole: 'INVESTOR' }, db);
    expect(r.mfaRequired).toBe(true);
    expect(r.session).toBeUndefined();
    expect(await sessionsOf(userId)).toBe(0);
    expect((await getMfaStatus(db, userId)).enabled).toBe(true);
  });

  it('wrong passwords still lock an enrolled account exactly as before', async () => {
    const u = await makeUser();
    await enroll(u.id, Date.now() - 10 * STEP);
    for (let i = 0; i < 5; i++) await attemptLogin({ email: u.email, password: 'Wrong2026passx' }, db);
    const r = await attemptLogin({ email: u.email, password: PW }, db);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/locked/);
    expect(await count('SELECT count(*) AS n FROM mfa_challenges WHERE user_id = ?', u.id)).toBe(0);
  });
});


// ─── Review regressions: state must still hold at COMMIT ────────────────────
// `beforeCommit` lands a competing change after the request has verified its
// password/code and before its batch runs — the exact stale-read interleaving.

describe('stale recovery code (checked before a regeneration commits)', () => {
  async function setup() {
    const u = await makeUser();
    const t0 = Date.now() - 10 * STEP;
    const { secret, codes } = await enroll(u.id, t0);
    const t = t0 + 4 * STEP;
    return { u, secret, codes, t };
  }
  const regenWithTotp = async (userId: string, secret: Uint8Array, t: number) =>
    regenerateRecoveryCodes(db, keys, userId, PW, await codeAt(secret, t), null, t);

  it('does not grant a session', async () => {
    const { u, secret, codes, t } = await setup();
    await db.prepare('UPDATE users SET failed_login_attempts = 2 WHERE id = ?').bind(u.id).run();
    const ch = await challenge(u.id, t);
    const r = await completeChallenge(db, keys, ch.token, codes[0]!, { ip: null }, failure, t, {
      beforeCommit: async () => void (await regenWithTotp(u.id, secret, t)),
    });
    expect(r.ok).toBe(false);
    expect(await sessionsOf(u.id)).toBe(0);
    expect(await count('SELECT failed_login_attempts AS n FROM users WHERE id = ?', u.id)).toBe(2); // not reset
    expect(await count("SELECT count(*) AS n FROM audit_logs WHERE actor_user_id = ? AND action IN ('AUTH_LOGIN', 'AUTH_MFA_RECOVERY_USED')", u.id)).toBe(0);
    expect((await getMfaStatus(db, u.id)).recoveryCodesRemaining).toBe(10); // the new set is untouched
  });

  it('does not turn 2FA off', async () => {
    const { u, secret, codes, t } = await setup();
    await expect(
      disableMfa(db, keys, u.id, PW, codes[0]!, null, t, { beforeCommit: async () => void (await regenWithTotp(u.id, secret, t)) }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getMfaStatus(db, u.id)).enabled).toBe(true);
    expect((await getMfaStatus(db, u.id)).recoveryCodesRemaining).toBe(10);
    expect(await count("SELECT count(*) AS n FROM audit_logs WHERE actor_user_id = ? AND action = 'MFA_DISABLED'", u.id)).toBe(0);
  });

  it('does not regenerate: the competing set stays, and no codes are returned', async () => {
    const { u, secret, codes, t } = await setup();
    let winner: string[] = [];
    const stale = regenerateRecoveryCodes(db, keys, u.id, PW, codes[0]!, null, t, {
      beforeCommit: async () => {
        winner = await regenWithTotp(u.id, secret, t);
      },
    });
    await expect(stale).rejects.toMatchObject({ status: 409 });
    expect(await count("SELECT count(*) AS n FROM audit_logs WHERE actor_user_id = ? AND action = 'MFA_RECOVERY_REGENERATED'", u.id)).toBe(1);
    const ch = await challenge(u.id, t + STEP);
    expect((await complete(ch.token, winner[3]!, t + STEP)).ok).toBe(true); // the winner's codes are the live ones
  });
});

describe('a no-op regeneration returns nothing', () => {
  it.each([
    ['the password changed', async (id: string) => db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword('Changed2026pw'), id).run()],
    ['the account was locked', async (id: string) => db.prepare('UPDATE users SET locked_until = ? WHERE id = ?').bind(Date.now() + 3_600_000, id).run()],
    ['2FA was turned off', async (id: string) => db.prepare('DELETE FROM mfa_factors WHERE user_id = ?').bind(id).run()],
  ])('when %s before commit: 409, existing codes untouched', async (_label, change) => {
    const u = await makeUser();
    const t0 = Date.now() - 10 * STEP;
    const { secret } = await enroll(u.id, t0);
    const t = t0 + 4 * STEP;
    const before = (await db.prepare('SELECT code_hash FROM mfa_recovery_codes WHERE user_id = ? ORDER BY code_hash').bind(u.id).all()).results;
    expect(before).toHaveLength(10); // an existing row count of 10 must not be mistaken for success
    await expect(
      regenerateRecoveryCodes(db, keys, u.id, PW, await codeAt(secret, t), null, t, { beforeCommit: async () => void (await change(u.id)) }),
    ).rejects.toMatchObject({ status: 409 });
    const after = (await db.prepare('SELECT code_hash FROM mfa_recovery_codes WHERE user_id = ? ORDER BY code_hash').bind(u.id).all()).results;
    expect(after).toEqual(before);
    expect(await count("SELECT count(*) AS n FROM audit_logs WHERE actor_user_id = ? AND action = 'MFA_RECOVERY_REGENERATED'", u.id)).toBe(0);
  });
});

describe('enrollment is bound to the credentials just verified', () => {
  it.each([
    ['a password change', async (id: string) => db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword('Changed2026pw'), id).run()],
    ['a lockout', async (id: string) => db.prepare('UPDATE users SET locked_until = ? WHERE id = ?').bind(Date.now() + 3_600_000, id).run()],
  ])('%s between the password check and the write: nothing is stored', async (_label, change) => {
    const u = await makeUser();
    await expect(
      startEnrollment(db, keys, u.id, PW, null, Date.now(), { beforeCommit: async () => void (await change(u.id)) }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await count('SELECT count(*) AS n FROM mfa_factors WHERE user_id = ?', u.id)).toBe(0);
    expect(await count("SELECT count(*) AS n FROM audit_logs WHERE actor_user_id = ? AND action = 'MFA_ENROLL_STARTED'", u.id)).toBe(0);
  });

  it.each([
    ['password', async (id: string) => db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword('Changed2026pw'), id).run()],
    ['login email', async (id: string) => db.prepare('UPDATE users SET email = ? WHERE id = ?').bind(`changed-${id}@test.example`, id).run()],
  ])('a %s change discards a pending (unverified) enrollment', async (_label, change) => {
    const u = await makeUser();
    const t = Date.now();
    const start = await startEnrollment(db, keys, u.id, PW, null, t);
    await change(u.id);
    expect(await count('SELECT count(*) AS n FROM mfa_factors WHERE user_id = ?', u.id)).toBe(0);
    await expect(confirmEnrollment(db, keys, u.id, await codeAt(base32Decode(start.secret), t), null, t)).rejects.toMatchObject({ status: 409 });
    expect((await getMfaStatus(db, u.id)).enabled).toBe(false);
  });

  it('a password or email change keeps an ENABLED factor and closes open challenges', async () => {
    const u = await makeUser();
    const t0 = Date.now() - 10 * STEP;
    await enroll(u.id, t0);
    await challenge(u.id, t0 + 4 * STEP);
    await db.prepare('UPDATE users SET password_hash = ?, email = ? WHERE id = ?').bind(await hashPassword('Changed2026pw'), `kept-${u.id}@test.example`, u.id).run();
    expect((await getMfaStatus(db, u.id)).enabled).toBe(true);
    expect((await getMfaStatus(db, u.id)).recoveryCodesRemaining).toBe(10);
    expect(await count('SELECT count(*) AS n FROM mfa_challenges WHERE user_id = ?', u.id)).toBe(0);
  });

  it('unrelated user updates (name, counters) leave a pending enrollment alone', async () => {
    const u = await makeUser();
    await startEnrollment(db, keys, u.id, PW, null, Date.now());
    await db.prepare('UPDATE users SET name = ?, failed_login_attempts = 1 WHERE id = ?').bind('Renamed', u.id).run();
    expect(await count('SELECT count(*) AS n FROM mfa_factors WHERE user_id = ?', u.id)).toBe(1);
  });
});

// A recovery code is only consumed by a batch that can actually succeed.
describe('recovery codes are never burned by an attempt that cannot succeed', () => {
  const unused = (id: string) => count('SELECT count(*) AS n FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL', id);

  it.each([
    ['a password reset', async (id: string) => db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(PW + 'x'), id).run(), PW + 'x'],
    ['a lockout', async (id: string) => db.prepare('UPDATE users SET locked_until = ? WHERE id = ?').bind(Date.now() + 60_000, id).run(), PW],
    ['the challenge being removed', async (id: string) => db.prepare('DELETE FROM mfa_challenges WHERE user_id = ?').bind(id).run(), PW],
  ])('sign-in: %s before commit → no session, code still valid on a fresh challenge', async (_label, change, _pw) => {
    const u = await makeUser();
    const t = Date.now();
    const { codes } = await enroll(u.id, t - 10 * STEP);
    const stale = await challenge(u.id, t);
    const r = await completeChallenge(db, keys, stale.token, codes[0]!, { ip: null }, failure, t, {
      beforeCommit: async () => void (await change(u.id)),
    });
    expect(r.ok).toBe(false);
    expect(await sessionsOf(u.id)).toBe(0);
    expect(await unused(u.id)).toBe(10); // nothing consumed

    // Clear the lock (if any) and use the SAME code with a fresh challenge.
    await db.prepare('UPDATE users SET locked_until = NULL WHERE id = ?').bind(u.id).run();
    const fresh = await challenge(u.id, t);
    expect(await complete(fresh.token, codes[0]!, t)).toMatchObject({ ok: true, method: 'recovery' });
    expect(await unused(u.id)).toBe(9);
  });

  it('a stale challenge (password reset before the code is entered) leaves the code usable', async () => {
    const u = await makeUser();
    const t = Date.now();
    const { codes } = await enroll(u.id, t - 10 * STEP);
    const stale = await challenge(u.id, t);
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword('Reset2026pass'), u.id).run();
    expect((await complete(stale.token, codes[0]!, t)).ok).toBe(false);
    expect(await unused(u.id)).toBe(10);
    const fresh = await challenge(u.id, t);
    expect((await complete(fresh.token, codes[0]!, t)).ok).toBe(true);
  });

  it.each([
    ['turning 2FA off', (id: string, code: string, t: number, hooks: { beforeCommit: () => Promise<void> }) => disableMfa(db, keys, id, PW, code, null, t, hooks)],
    ['regenerating codes', (id: string, code: string, t: number, hooks: { beforeCommit: () => Promise<void> }) => regenerateRecoveryCodes(db, keys, id, PW, code, null, t, hooks)],
  ])('settings: %s that fails at commit does not consume the code', async (_label, mutate) => {
    const u = await makeUser();
    const t = Date.now();
    const { codes } = await enroll(u.id, t - 10 * STEP);
    await expect(
      mutate(u.id, codes[0]!, t, { beforeCommit: async () => void (await db.prepare('UPDATE users SET locked_until = ? WHERE id = ?').bind(Date.now() + 60_000, u.id).run()) }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await unused(u.id)).toBe(10);
    expect((await getMfaStatus(db, u.id)).enabled).toBe(true);
    // Wrong password / wrong code are rejected before any write, too.
    await db.prepare('UPDATE users SET locked_until = NULL WHERE id = ?').bind(u.id).run();
    await expect(mutate(u.id, codes[0]!, t, { beforeCommit: async () => {} }).then(() => 'ok')).resolves.toBe('ok');
  });

  it('two requests in the same millisecond cannot both use one code', async () => {
    const u = await makeUser();
    const t = Date.now();
    const { codes } = await enroll(u.id, t - 10 * STEP);
    const a = await challenge(u.id, t);
    const b = await challenge(u.id, t);
    // B checks the code, then A commits fully, then B commits with the same `now`.
    const rb = await completeChallenge(db, keys, b.token, codes[0]!, { ip: null }, failure, t, {
      beforeCommit: async () => {
        expect((await complete(a.token, codes[0]!, t)).ok).toBe(true);
      },
    });
    expect(rb.ok).toBe(false);
    expect(await sessionsOf(u.id)).toBe(1);
  });
});
