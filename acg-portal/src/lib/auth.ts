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
import { audit, auditStmt, auditStmtIf } from './audit';
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
const TIMING_DUMMY_HASH =
  'scrypt$ln=15,r=8,p=3$q2Lh7mOYz1H3sTqv0Yh0Xw$7m2kq5nJm1o0W3Q8u0k5aYJ0ZQd3d9yq3n5H6t2y0aE';

/**
 * Atomically count one failed attempt: increments the counter, locks the
 * account when it reaches LOGIN_MAX_ATTEMPTS (resetting the counter), and
 * writes AUTH_LOGIN_FAILED or AUTH_LOCKOUT — all in one batch, so concurrent
 * failures can neither lose an increment nor skip the lockout.
 */
export async function recordFailedLogin(database: D1Database, userId: string, ip: string | null, now = Date.now()) {
  const lockedUntil = now + LOGIN_LOCKOUT_MS;
  const max = LOGIN_MAX_ATTEMPTS;
  await database.batch([
    database
      .prepare(
        `UPDATE users SET
           failed_login_attempts = CASE WHEN failed_login_attempts + 1 >= ?1 THEN 0 ELSE failed_login_attempts + 1 END,
           locked_until = CASE WHEN failed_login_attempts + 1 >= ?1 THEN ?2 ELSE NULL END
         WHERE id = ?3`,
      )
      .bind(max, lockedUntil, userId),
    auditStmtIf(
      database,
      { action: 'AUTH_LOCKOUT', actorUserId: userId, ip, metadata: { attempts: max } },
      '(SELECT locked_until FROM users WHERE id = ?) = ?',
      [userId, lockedUntil],
      now,
    ),
    auditStmtIf(
      database,
      { action: 'AUTH_LOGIN_FAILED', actorUserId: userId, ip, metadata: { reason: 'password' } },
      '(SELECT locked_until FROM users WHERE id = ?) IS NULL',
      [userId],
      now,
    ),
  ]);
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
  const ip = params.ip ?? null;

  const user = await findUserByEmail(database, email);

  if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await audit(database, { action: 'AUTH_LOGIN_FAILED', actorUserId: user.id, ip, metadata: { reason: 'locked' } });
    return { ok: false, error: 'Account temporarily locked. Try again later or reset your password.' };
  }

  // Always run a verification to keep timing roughly constant.
  const valid = await verifyPassword(user?.passwordHash ?? TIMING_DUMMY_HASH, params.password);

  if (!user || !valid) {
    if (user) await recordFailedLogin(database, user.id, ip);
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

  const at = Date.now();
  const session = prepareSession(database, user.id, { ip, userAgent: params.userAgent }, at);
  await database.batch([
    database.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?').bind(user.id),
    session.statement,
    auditStmt(database, { action: 'AUTH_LOGIN', actorUserId: user.id, ip }, at),
  ]);

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
    session: { token: session.token, expiresAt: session.expiresAt },
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
