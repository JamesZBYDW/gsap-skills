import 'server-only';
import { randomBytes } from 'node:crypto';
import { isUniqueViolation, newId, type D1Database, type D1PreparedStatement } from '@/server/db/d1';
import { findUserById } from '@/server/db/repo';
import { auditStmt, auditStmtIf, audit } from '@/lib/audit';
import { HttpError } from '@/lib/http';
import { verifyPassword } from '@/lib/password';
import { prepareSession, sha256 } from '@/lib/session';
import { LOGIN_MAX_ATTEMPTS } from '@/lib/ratelimit';
import { base32Encode, otpauthUri, verifyTotp } from '@/lib/totp';
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  normalizeRecoveryCode,
  recoveryCodeHash,
  type MfaKeys,
} from '@/lib/mfa-crypto';
import type { User } from '@/lib/domain';

// Two-factor authentication: enrollment, verification, recovery codes and the
// login challenge. Every state change is ONE D1 batch with its audit rows.
// Single use (challenge, TOTP time step, recovery code) is enforced by
// INSERTs into mfa_spent, whose UNIQUE key aborts the whole batch on reuse.

export const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const MFA_MAX_ATTEMPTS = 5;
export const MFA_ENROLLMENT_TTL_MS = 15 * 60 * 1000;

/** SQL guard: the user still has `password_hash = ?` and is not locked at `?`. */
const USER_UNCHANGED = `EXISTS (SELECT 1 FROM users WHERE id = ? AND password_hash = ? AND (locked_until IS NULL OR locked_until <= ?))`;

// ─── Status ─────────────────────────────────────────────────────────────────

export interface MfaStatus {
  enabled: boolean;
  enabledAt: Date | null;
  recoveryCodesRemaining: number;
}

export async function getMfaStatus(database: D1Database, userId: string): Promise<MfaStatus> {
  const r = await database
    .prepare(
      `SELECT f.enabled_at AS enabled_at,
              (SELECT count(*) FROM mfa_recovery_codes c WHERE c.user_id = ?1 AND c.used_at IS NULL) AS remaining
       FROM users u LEFT JOIN mfa_factors f ON f.user_id = u.id WHERE u.id = ?1`,
    )
    .bind(userId)
    .first<{ enabled_at: number | null; remaining: number }>();
  const enabledAt = r?.enabled_at ? new Date(Number(r.enabled_at)) : null;
  return { enabled: !!enabledAt, enabledAt, recoveryCodesRemaining: enabledAt ? Number(r?.remaining ?? 0) : 0 };
}

export async function hasEnabledFactor(database: D1Database, userId: string): Promise<boolean> {
  return !!(await database
    .prepare('SELECT 1 AS ok FROM mfa_factors WHERE user_id = ? AND enabled_at IS NOT NULL')
    .bind(userId)
    .first());
}

interface FactorRow {
  secret_ciphertext: string;
  created_at: number;
  enabled_at: number | null;
}

async function getFactor(database: D1Database, userId: string): Promise<FactorRow | null> {
  return database.prepare('SELECT secret_ciphertext, created_at, enabled_at FROM mfa_factors WHERE user_id = ?').bind(userId).first<FactorRow>();
}

// ─── Codes ──────────────────────────────────────────────────────────────────

type CheckedCode = { kind: 'totp'; step: number } | { kind: 'recovery'; id: string; hash: string };

/** Check a TOTP or recovery code for `userId` (no state change). */
async function checkCode(
  database: D1Database,
  keys: MfaKeys,
  userId: string,
  secretCiphertext: string,
  code: string,
  now: number,
  allowRecovery: boolean,
): Promise<CheckedCode | null> {
  const trimmed = code.trim();
  if (/^\d{3}\s?\d{3}$/.test(trimmed)) {
    const step = await verifyTotp(await decryptSecret(keys, userId, secretCiphertext), trimmed, now);
    return step === null ? null : { kind: 'totp', step };
  }
  if (!allowRecovery) return null;
  const normalized = normalizeRecoveryCode(trimmed);
  if (!normalized) return null;
  const hash = await recoveryCodeHash(keys, userId, normalized);
  const row = await database
    .prepare('SELECT id FROM mfa_recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL')
    .bind(userId, hash)
    .first<{ id: string }>();
  return row ? { kind: 'recovery', id: row.id, hash } : null;
}

/** Statements that consume a checked code (abort the batch if already spent). */
function spendCode(database: D1Database, userId: string, checked: CheckedCode, now: number): D1PreparedStatement[] {
  if (checked.kind === 'totp') {
    return [
      database.prepare(`INSERT INTO mfa_spent (user_id, kind, value, created_at) VALUES (?, 'totp', ?, ?)`).bind(userId, String(checked.step), now),
    ];
  }
  return [
    database.prepare(`INSERT INTO mfa_spent (user_id, kind, value, created_at) VALUES (?, 'recovery', ?, ?)`).bind(userId, checked.hash, now),
    database.prepare('UPDATE mfa_recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL').bind(now, checked.id),
  ];
}

async function recoveryCodeRows(database: D1Database, keys: MfaKeys, userId: string, now: number, onlyIf: string, onlyIfParams: unknown[]) {
  const codes = generateRecoveryCodes();
  const statements: D1PreparedStatement[] = [];
  for (const code of codes) {
    const hash = await recoveryCodeHash(keys, userId, normalizeRecoveryCode(code)!);
    statements.push(
      database
        .prepare(`INSERT INTO mfa_recovery_codes (id, user_id, code_hash, created_at) SELECT ?, ?, ?, ? WHERE ${onlyIf}`)
        .bind(newId(), userId, hash, now, ...onlyIfParams),
    );
  }
  return { codes, statements };
}

// ─── Re-authentication (settings changes) ───────────────────────────────────

async function reauthenticate(database: D1Database, userId: string, password: string): Promise<User> {
  const user = await findUserById(database, userId);
  if (!user) throw new HttpError(401, 'Not authenticated.');
  if (!(await verifyPassword(user.passwordHash, password))) {
    throw new HttpError(400, 'Password is incorrect.');
  }
  return user;
}

// ─── Enrollment ─────────────────────────────────────────────────────────────

export interface EnrollmentStart {
  secret: string;
  otpauthUri: string;
}

/**
 * Begin enrollment (password required): store a new, not-yet-enabled secret.
 * Has no effect on sign-in until confirmed with a valid code.
 */
export async function startEnrollment(
  database: D1Database,
  keys: MfaKeys,
  userId: string,
  password: string,
  ip: string | null,
  now = Date.now(),
): Promise<EnrollmentStart> {
  const user = await reauthenticate(database, userId, password);
  const secret = new Uint8Array(randomBytes(20));
  const ciphertext = await encryptSecret(keys, userId, secret);
  const [upsert] = await database.batch([
    database
      .prepare(
        `INSERT INTO mfa_factors (user_id, secret_ciphertext, created_at, enabled_at) VALUES (?, ?, ?, NULL)
         ON CONFLICT (user_id) DO UPDATE SET secret_ciphertext = excluded.secret_ciphertext, created_at = excluded.created_at
         WHERE mfa_factors.enabled_at IS NULL`,
      )
      .bind(userId, ciphertext, now),
    auditStmtIf(database, { action: 'MFA_ENROLL_STARTED', actorUserId: userId, targetType: 'User', targetId: userId, ip }, 'changes() = 1', [], now),
  ]);
  if (!upsert?.meta.changes) throw new HttpError(409, 'Two-factor authentication is already on.');
  const encoded = base32Encode(secret);
  return { secret: encoded, otpauthUri: otpauthUri(encoded, user.email) };
}

/** Confirm enrollment with a code from the app; returns recovery codes once. */
export async function confirmEnrollment(
  database: D1Database,
  keys: MfaKeys,
  userId: string,
  code: string,
  ip: string | null,
  now = Date.now(),
): Promise<string[]> {
  const factor = await getFactor(database, userId);
  if (!factor || factor.enabled_at !== null) throw new HttpError(409, 'Start setup again.');
  if (now - Number(factor.created_at) > MFA_ENROLLMENT_TTL_MS) throw new HttpError(409, 'Setup expired. Start again.');
  const checked = await checkCode(database, keys, userId, factor.secret_ciphertext, code, now, false);
  if (!checked) throw new HttpError(400, 'That code is not valid. Check the time on your device and try again.');

  const enabledHere = 'EXISTS (SELECT 1 FROM mfa_factors WHERE user_id = ? AND enabled_at = ?)';
  const { codes, statements } = await recoveryCodeRows(database, keys, userId, now, enabledHere, [userId, now]);
  let results;
  try {
    results = await database.batch([
      ...spendCode(database, userId, checked, now),
      database
        .prepare('UPDATE mfa_factors SET enabled_at = ? WHERE user_id = ? AND enabled_at IS NULL AND secret_ciphertext = ?')
        .bind(now, userId, factor.secret_ciphertext),
      database.prepare(`DELETE FROM mfa_recovery_codes WHERE user_id = ? AND ${enabledHere}`).bind(userId, userId, now),
      ...statements,
      auditStmtIf(database, { action: 'MFA_ENABLED', actorUserId: userId, targetType: 'User', targetId: userId, ip }, enabledHere, [userId, now], now),
    ]);
  } catch (err) {
    if (isUniqueViolation(err, 'mfa_spent')) throw new HttpError(400, 'That code was already used. Wait for the next one.');
    throw err;
  }
  if (!results[1]?.meta.changes) throw new HttpError(409, 'Start setup again.');
  return codes;
}

// ─── Disable / regenerate (password + current code) ─────────────────────────

async function reauthWithCode(database: D1Database, keys: MfaKeys, userId: string, password: string, code: string, now: number) {
  const user = await reauthenticate(database, userId, password);
  const factor = await getFactor(database, userId);
  if (!factor || factor.enabled_at === null) throw new HttpError(409, 'Two-factor authentication is not on.');
  const checked = await checkCode(database, keys, userId, factor.secret_ciphertext, code, now, true);
  if (!checked) throw new HttpError(400, 'That code is not valid.');
  return { user, factor, checked };
}

export async function disableMfa(
  database: D1Database,
  keys: MfaKeys,
  userId: string,
  password: string,
  code: string,
  ip: string | null,
  now = Date.now(),
): Promise<void> {
  const { user, factor, checked } = await reauthWithCode(database, keys, userId, password, code, now);
  let results;
  try {
    results = await database.batch([
      ...spendCode(database, userId, checked, now),
      database
        .prepare(`DELETE FROM mfa_factors WHERE user_id = ? AND secret_ciphertext = ? AND enabled_at IS NOT NULL AND ${USER_UNCHANGED}`)
        .bind(userId, factor.secret_ciphertext, userId, user.passwordHash, now),
      auditStmtIf(database, { action: 'MFA_DISABLED', actorUserId: userId, targetType: 'User', targetId: userId, ip, metadata: { with: checked.kind } }, 'changes() = 1', [], now),
      database.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM mfa_factors WHERE user_id = ?)').bind(userId, userId),
    ]);
  } catch (err) {
    if (isUniqueViolation(err, 'mfa_spent')) throw new HttpError(400, 'That code was already used.');
    throw err;
  }
  const deleted = results[checked.kind === 'totp' ? 1 : 2];
  if (!deleted?.meta.changes) throw new HttpError(409, 'Your sign-in details changed. Please try again.');
}

export async function regenerateRecoveryCodes(
  database: D1Database,
  keys: MfaKeys,
  userId: string,
  password: string,
  code: string,
  ip: string | null,
  now = Date.now(),
): Promise<string[]> {
  const { user, factor, checked } = await reauthWithCode(database, keys, userId, password, code, now);
  const stillEnabled = `EXISTS (SELECT 1 FROM mfa_factors WHERE user_id = ? AND secret_ciphertext = ? AND enabled_at IS NOT NULL) AND ${USER_UNCHANGED}`;
  const guardParams = [userId, factor.secret_ciphertext, userId, user.passwordHash, now];
  const { codes, statements } = await recoveryCodeRows(database, keys, userId, now, stillEnabled, guardParams);
  try {
    await database.batch([
      ...spendCode(database, userId, checked, now),
      database.prepare(`DELETE FROM mfa_recovery_codes WHERE user_id = ? AND ${stillEnabled}`).bind(userId, ...guardParams),
      ...statements,
      auditStmtIf(database, { action: 'MFA_RECOVERY_REGENERATED', actorUserId: userId, targetType: 'User', targetId: userId, ip }, stillEnabled, guardParams, now),
    ]);
  } catch (err) {
    if (isUniqueViolation(err, 'mfa_spent')) throw new HttpError(400, 'That code was already used.');
    throw err;
  }
  const status = await getMfaStatus(database, userId);
  if (status.recoveryCodesRemaining !== codes.length) throw new HttpError(409, 'Your sign-in details changed. Please try again.');
  return codes;
}

// ─── Login challenge ────────────────────────────────────────────────────────

/**
 * After a correct password for an account with 2FA on: create the pending
 * challenge (no session). Guarded on the verified hash + unlocked state.
 */
export async function createChallenge(
  database: D1Database,
  userId: string,
  verifiedHash: string,
  meta: { ip: string | null; userAgent?: string | null },
  now = Date.now(),
): Promise<{ token: string; expiresAt: Date } | null> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now + MFA_CHALLENGE_TTL_MS);
  const [, inserted] = await database.batch([
    // Housekeeping: expired challenges and old single-use markers.
    database
      .prepare(`DELETE FROM mfa_challenges WHERE expires_at < ?`)
      .bind(now),
    database
      .prepare(
        `INSERT INTO mfa_challenges (id, token_hash, user_id, password_hash, attempts, expires_at, created_at, ip, user_agent)
         SELECT ?, ?, ?, ?, 0, ?, ?, ?, ? WHERE ${USER_UNCHANGED}`,
      )
      .bind(newId(), sha256(token), userId, verifiedHash, expiresAt.getTime(), now, meta.ip, meta.userAgent?.slice(0, 512) ?? null, userId, verifiedHash, now),
    auditStmtIf(database, { action: 'AUTH_MFA_CHALLENGE', actorUserId: userId, ip: meta.ip }, 'changes() = 1', [], now),
    database.prepare(`DELETE FROM mfa_spent WHERE kind IN ('totp', 'challenge') AND created_at < ?`).bind(now - 24 * 3600 * 1000),
  ]);
  return inserted?.meta.changes === 1 ? { token, expiresAt } : null;
}

export type ChallengeOutcome =
  | { ok: true; userId: string; role: 'INVESTOR' | 'TEAM'; session: { token: string; expiresAt: Date }; method: 'totp' | 'recovery' }
  | { ok: false; reason: 'expired' }
  | { ok: false; reason: 'invalid'; attemptsLeft: number }
  | { ok: false; reason: 'changed' };

/**
 * Complete a login challenge with a TOTP or recovery code.
 *  1. Reserve an attempt atomically (at most MFA_MAX_ATTEMPTS checks per
 *     challenge, however many requests race).
 *  2. Check the code. A wrong code also counts as a failed login for the
 *     account (same lockout as passwords, guarded on the verified hash).
 *  3. On a right code, one batch: spend the challenge and the code (UNIQUE →
 *     a replay or a concurrent duplicate aborts everything), reset the
 *     counters, insert the session and audit — each gated on the credentials
 *     verified at step one, the account being unlocked, the same factor still
 *     being on, and the challenge not expired.
 */
export async function completeChallenge(
  database: D1Database,
  keys: MfaKeys,
  token: string,
  code: string,
  meta: { ip: string | null; userAgent?: string | null },
  recordFailure: (userId: string, checkedHash: string) => Promise<void>,
  now = Date.now(),
): Promise<ChallengeOutcome> {
  const challenge = await database
    .prepare(
      `UPDATE mfa_challenges SET attempts = attempts + 1
       WHERE token_hash = ? AND expires_at > ? AND attempts < ?
       RETURNING id, user_id, password_hash, attempts`,
    )
    .bind(sha256(token), now, MFA_MAX_ATTEMPTS)
    .first<{ id: string; user_id: string; password_hash: string; attempts: number }>();
  if (!challenge) return { ok: false, reason: 'expired' };

  const userId = challenge.user_id;
  const factor = await getFactor(database, userId);
  if (!factor || factor.enabled_at === null) return { ok: false, reason: 'changed' };

  const checked = await checkCode(database, keys, userId, factor.secret_ciphertext, code, now, true);
  if (!checked) {
    await recordFailure(userId, challenge.password_hash);
    await audit(database, { action: 'AUTH_MFA_FAILED', actorUserId: userId, ip: meta.ip, metadata: { attempt: challenge.attempts } });
    const attemptsLeft = Math.max(0, MFA_MAX_ATTEMPTS - Number(challenge.attempts));
    if (attemptsLeft === 0) {
      await database.prepare('DELETE FROM mfa_challenges WHERE id = ?').bind(challenge.id).run();
      return { ok: false, reason: 'expired' };
    }
    return { ok: false, reason: 'invalid', attemptsLeft };
  }

  const session = prepareSession(database, userId, meta, now, {
    passwordHash: challenge.password_hash,
    extraCondition: `EXISTS (SELECT 1 FROM mfa_factors WHERE user_id = ? AND secret_ciphertext = ? AND enabled_at IS NOT NULL)
                     AND EXISTS (SELECT 1 FROM mfa_challenges WHERE id = ? AND expires_at > ?)`,
    extraParams: [userId, factor.secret_ciphertext, challenge.id, now],
  });
  const statements = [
    database.prepare(`INSERT INTO mfa_spent (user_id, kind, value, created_at) VALUES (?, 'challenge', ?, ?)`).bind(userId, challenge.id, now),
    ...spendCode(database, userId, checked, now),
    database
      .prepare(`UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ? AND password_hash = ? AND (locked_until IS NULL OR locked_until <= ?)`)
      .bind(userId, challenge.password_hash, now),
    session.statement,
    database.prepare('DELETE FROM mfa_challenges WHERE id = ?').bind(challenge.id),
    auditStmtIf(
      database,
      { action: 'AUTH_LOGIN', actorUserId: userId, ip: meta.ip, metadata: { mfa: checked.kind } },
      'EXISTS (SELECT 1 FROM sessions WHERE token_hash = ?)',
      [session.tokenHash],
      now,
    ),
    ...(checked.kind === 'recovery'
      ? [
          auditStmtIf(
            database,
            { action: 'AUTH_MFA_RECOVERY_USED', actorUserId: userId, targetType: 'User', targetId: userId, ip: meta.ip },
            'EXISTS (SELECT 1 FROM sessions WHERE token_hash = ?)',
            [session.tokenHash],
            now,
          ),
        ]
      : []),
  ];
  const sessionIndex = statements.indexOf(session.statement);
  let results;
  try {
    results = await database.batch(statements);
  } catch (err) {
    if (isUniqueViolation(err, 'mfa_spent')) {
      // The challenge or the code was already used (replay or duplicate submit).
      await recordFailure(userId, challenge.password_hash);
      await audit(database, { action: 'AUTH_MFA_FAILED', actorUserId: userId, ip: meta.ip, metadata: { reason: 'replay' } });
      return { ok: false, reason: 'invalid', attemptsLeft: Math.max(0, MFA_MAX_ATTEMPTS - Number(challenge.attempts)) };
    }
    throw err;
  }
  if (results[sessionIndex]?.meta.changes !== 1) return { ok: false, reason: 'changed' };

  const user = await findUserById(database, userId);
  return { ok: true, userId, role: user!.role, session: { token: session.token, expiresAt: session.expiresAt }, method: checked.kind };
}

export const MFA_LOCKOUT_ATTEMPTS = LOGIN_MAX_ATTEMPTS;
