import 'server-only';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { D1Database } from '@/server/db/d1';
import { findUserByEmail, investorExists, investorIdForUser } from '@/server/db/repo';
import { verifyPassword } from './password';
import {
  destroySession,
  getSessionUser,
  getImpersonatedInvestorId,
  prepareSession,
  setSessionCookie,
  type SessionUser,
} from './session';
import { audit, auditStmtIf } from './audit';
import { HttpError } from './http';
import { LOGIN_MAX_ATTEMPTS, LOGIN_LOCKOUT_MS } from './ratelimit';

export type { SessionUser } from './session';

export type Role = 'INVESTOR' | 'TEAM';

export interface Actor {
  user: SessionUser;
  /** When a TEAM user is viewing an investor's portal read-only. */
  impersonatedInvestorId: string | null;
  /** True when the current view must block all mutations. */
  readOnly: boolean;
}

export interface LoginResult {
  ok: boolean;
  error?: string;
  user?: SessionUser;
  /** Set on success; the caller sets the cookie (see setSessionCookie). */
  session?: { token: string; expiresAt: Date };
}

// A well-formed hash of a random password, verified when the account does not
// exist so the response time does not reveal which emails have accounts.
export const TIMING_DUMMY_HASH =
  'scrypt$ln=15,r=8,p=3$q2Lh7mOYz1H3sTqv0Yh0Xw$7m2kq5nJm1o0W3Q8u0k5aYJ0ZQd3d9yq3n5H6t2y0aE';

/**
 * Atomically count one failed attempt, but only if, when the batch commits,
 * the account is still unlocked and still has the password hash the attempt
 * was checked against. So an attempt that read the account before a lockout
 * cannot clear or restart that lockout, and an attempt against an old
 * password cannot count against new credentials. Reaching
 * LOGIN_MAX_ATTEMPTS locks the account and resets the counter. Exactly one
 * audit record is written per attempt, in the same batch:
 * AUTH_LOCKOUT when this attempt locked the account, otherwise
 * AUTH_LOGIN_FAILED (with reason "not_counted" when the guard skipped it).
 */
export async function recordFailedLogin(
  database: D1Database,
  userId: string,
  checkedHash: string,
  ip: string | null,
  now = Date.now(),
) {
  const lockedUntil = now + LOGIN_LOCKOUT_MS;
  await database.batch([
    database
      .prepare(
        `UPDATE users SET
           failed_login_attempts = CASE WHEN failed_login_attempts + 1 >= ?1 THEN 0 ELSE failed_login_attempts + 1 END,
           locked_until = CASE WHEN failed_login_attempts + 1 >= ?1 THEN ?2 ELSE NULL END
         WHERE id = ?3 AND password_hash = ?4 AND (locked_until IS NULL OR locked_until <= ?5)`,
      )
      .bind(LOGIN_MAX_ATTEMPTS, lockedUntil, userId, checkedHash, now),
    // changes() is the row count of the UPDATE just above (same transaction).
    database
      .prepare(
        `INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, metadata, ip, created_at)
         SELECT ?1, ?2,
                CASE WHEN changes() = 1 AND locked_until = ?3 THEN 'AUTH_LOCKOUT' ELSE 'AUTH_LOGIN_FAILED' END,
                NULL, NULL,
                CASE WHEN changes() = 0 THEN json_object('reason', 'not_counted')
                     WHEN locked_until = ?3 THEN json_object('attempts', ?4)
                     ELSE json_object('reason', 'password', 'attempts', failed_login_attempts) END,
                ?5, ?6
         FROM users WHERE id = ?2`,
      )
      .bind(crypto.randomUUID(), userId, lockedUntil, LOGIN_MAX_ATTEMPTS, ip, now),
  ]);
}

/**
 * Finish a login whose password was verified against `verifiedHash`. The
 * counter reset, the session row and the AUTH_LOGIN record are one batch,
 * and each is gated on the account still having that hash and not being
 * locked at commit time — a lockout or credential reset that lands while the
 * password was being checked wins, and no session (or cookie) is issued.
 */
export async function finalizeLogin(
  database: D1Database,
  userId: string,
  verifiedHash: string,
  meta: { ip: string | null; userAgent?: string | null },
  now = Date.now(),
): Promise<{ token: string; expiresAt: Date } | null> {
  const guard = 'id = ? AND password_hash = ? AND (locked_until IS NULL OR locked_until <= ?)';
  const session = prepareSession(database, userId, meta, now, { passwordHash: verifiedHash });
  const [, inserted] = await database.batch([
    database.prepare(`UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE ${guard}`).bind(userId, verifiedHash, now),
    session.statement,
    auditStmtIf(
      database,
      { action: 'AUTH_LOGIN', actorUserId: userId, ip: meta.ip },
      'EXISTS (SELECT 1 FROM sessions WHERE token_hash = ?)',
      [session.tokenHash],
      now,
    ),
  ]);
  return inserted?.meta.changes === 1 ? { token: session.token, expiresAt: session.expiresAt } : null;
}

/**
 * Attempt a login. Enforces per-account lockout after repeated failures and
 * audits every outcome. Uses a generic error to avoid account enumeration.
 */
export async function attemptLogin(
  params: {
    email: string;
    password: string;
    expectedRole?: Role;
    ip?: string | null;
    userAgent?: string | null;
  },
  database: D1Database = db(),
): Promise<LoginResult> {
  const email = params.email.trim().toLowerCase();
  const generic = 'Invalid email or password.';
  const locked = 'Account temporarily locked. Try again later or reset your password.';
  const ip = params.ip ?? null;

  const user = await findUserByEmail(database, email);

  if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await audit(database, { action: 'AUTH_LOGIN_FAILED', actorUserId: user.id, ip, metadata: { reason: 'locked' } });
    return { ok: false, error: locked };
  }

  // Always run a verification to keep timing roughly constant.
  const valid = await verifyPassword(user?.passwordHash ?? TIMING_DUMMY_HASH, params.password);

  if (!user || !valid) {
    if (user) await recordFailedLogin(database, user.id, user.passwordHash, ip);
    return { ok: false, error: generic };
  }

  // Role mismatch: the chosen side must match the account's role.
  if (params.expectedRole && user.role !== params.expectedRole) {
    await audit(database, { action: 'AUTH_LOGIN_FAILED', actorUserId: user.id, ip, metadata: { reason: 'role_mismatch' } });
    return {
      ok: false,
      error:
        user.role === 'TEAM'
          ? 'This is a team account. Choose "Investor Relations" to sign in.'
          : 'This is an investor account. Choose "Investor" to sign in.',
    };
  }

  const session = await finalizeLogin(database, user.id, user.passwordHash, { ip, userAgent: params.userAgent });
  if (!session) {
    // The account was locked or its credentials changed while the password
    // was being checked. No session was created.
    await audit(database, { action: 'AUTH_LOGIN_FAILED', actorUserId: user.id, ip, metadata: { reason: 'changed_during_login' } });
    return { ok: false, error: generic };
  }

  const investorId = user.role === 'INVESTOR' ? await investorIdForUser(database, user.id) : null;

  return {
    ok: true,
    user: {
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      investorId,
      mustChangePassword: user.mustChangePassword,
    },
    session,
  };
}

/** Route-level login: attempt, then set the session cookie on success. */
export async function login(params: Parameters<typeof attemptLogin>[0]): Promise<LoginResult> {
  const result = await attemptLogin(params);
  if (result.ok && result.session) await setSessionCookie(result.session);
  return result;
}

export async function logout(ip?: string | null): Promise<void> {
  const user = await getSessionUser();
  const database = db();
  await destroySession(database);
  if (user) await audit(database, { action: 'AUTH_LOGOUT', actorUserId: user.id, ip });
}

// ─── Server-component guards (redirect-based) ───────────────────────────────

/** For server components: returns the user or redirects to /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}

/**
 * Resolve the full actor, honoring TEAM read-only impersonation. Validates the
 * impersonation target exists; otherwise the impersonation is ignored.
 */
export async function resolveActor(): Promise<Actor | null> {
  const user = await getSessionUser();
  if (!user) return null;

  if (user.role === 'TEAM') {
    const impersonatedInvestorId = await getImpersonatedInvestorId();
    if (impersonatedInvestorId) {
      if (await investorExists(db(), impersonatedInvestorId)) {
        return { user, impersonatedInvestorId, readOnly: true };
      }
    }
  }
  return { user, impersonatedInvestorId: null, readOnly: false };
}

/** Investor-side guard. Returns the investorId in view + whether read-only. */
export async function requireInvestorView(): Promise<{ actor: Actor; investorId: string; readOnly: boolean }> {
  const actor = await resolveActor();
  if (!actor) redirect('/login');

  if (actor.user.role === 'TEAM') {
    if (!actor.impersonatedInvestorId) redirect('/console/overview');
    return { actor, investorId: actor.impersonatedInvestorId, readOnly: true };
  }

  if (!actor.user.investorId) redirect('/login');
  return { actor, investorId: actor.user.investorId, readOnly: false };
}

/** Team-side guard. Investors are redirected to their portal. */
export async function requireTeamView(): Promise<Actor> {
  const actor = await resolveActor();
  if (!actor) redirect('/login');
  if (actor.user.role !== 'TEAM') redirect('/portal/overview');
  return actor;
}

// ─── API guards (throw HttpError) ───────────────────────────────────────────

export async function apiRequireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, 'Not authenticated.');
  return user;
}

export async function apiRequireTeam(): Promise<SessionUser> {
  const user = await apiRequireUser();
  if (user.role !== 'TEAM') throw new HttpError(403, 'Team access required.');
  return user;
}

/**
 * For investor-scoped mutations. Returns the acting investorId. TEAM users may
 * NOT mutate via impersonation (read-only) — they act through the console.
 */
export async function apiRequireOwnInvestor(): Promise<{ user: SessionUser; investorId: string }> {
  const user = await apiRequireUser();
  if (user.role !== 'INVESTOR' || !user.investorId) {
    throw new HttpError(403, 'Investor account required.');
  }
  // Block mutation while a team user is impersonating (defense in depth).
  const impersonating = await getImpersonatedInvestorId();
  if (impersonating) throw new HttpError(403, 'Read-only view.');
  return { user, investorId: user.investorId };
}

/** Authorize that the given investorId is accessible to the current user. */
export async function apiAuthorizeInvestor(investorId: string): Promise<SessionUser> {
  const user = await apiRequireUser();
  if (user.role === 'TEAM') return user;
  if (user.role === 'INVESTOR' && user.investorId === investorId) return user;
  throw new HttpError(403, 'Not authorized for this investor.');
}
