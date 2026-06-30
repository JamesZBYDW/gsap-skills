import 'server-only';
import { redirect } from 'next/navigation';
import { prisma } from './db';
import { verifyPassword } from './password';
import {
  createSession,
  destroySession,
  getSessionUser,
  getImpersonatedInvestorId,
  type SessionUser,
} from './session';
import { audit } from './audit';
import { HttpError } from './http';
import {
  LOGIN_MAX_ATTEMPTS,
  LOGIN_LOCKOUT_MS,
} from './ratelimit';

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
}

/**
 * Attempt a login. Enforces per-account lockout after repeated failures and
 * audits every outcome. Uses a generic error to avoid account enumeration.
 */
export async function attemptLogin(params: {
  email: string;
  password: string;
  expectedRole?: Role;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<LoginResult> {
  const email = params.email.trim().toLowerCase();
  const generic = 'Invalid email or password.';

  const user = await prisma.user.findUnique({ where: { email } });

  // Always run a verification to keep timing roughly constant even when the
  // account does not exist.
  const hashToCheck =
    user?.passwordHash ??
    '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$3Q9p3l6Y3mY3mY3mY3mY3mY3mY3mY3mY3mY3mY3mY3m';

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    await audit({ action: 'AUTH_LOGIN_FAILED', actorUserId: user.id, ip: params.ip, metadata: { reason: 'locked' } });
    return { ok: false, error: 'Account temporarily locked. Try again later or reset your password.' };
  }

  const valid = await verifyPassword(hashToCheck, params.password);

  if (!user || !valid) {
    if (user) {
      const attempts = user.failedLoginAttempts + 1;
      const locked = attempts >= LOGIN_MAX_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: locked ? 0 : attempts,
          lockedUntil: locked ? new Date(Date.now() + LOGIN_LOCKOUT_MS) : null,
        },
      });
      await audit({
        action: locked ? 'AUTH_LOCKOUT' : 'AUTH_LOGIN_FAILED',
        actorUserId: user.id,
        ip: params.ip,
        metadata: { attempts },
      });
    }
    return { ok: false, error: generic };
  }

  // Role mismatch: the chosen side must match the account's role.
  if (params.expectedRole && user.role !== params.expectedRole) {
    await audit({ action: 'AUTH_LOGIN_FAILED', actorUserId: user.id, ip: params.ip, metadata: { reason: 'role_mismatch' } });
    return {
      ok: false,
      error:
        user.role === 'TEAM'
          ? 'This is a team account. Choose "Investor Relations" to sign in.'
          : 'This is an investor account. Choose "Investor" to sign in.',
    };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });

  await createSession(user.id, { ip: params.ip, userAgent: params.userAgent });
  await audit({ action: 'AUTH_LOGIN', actorUserId: user.id, ip: params.ip });

  const investor = user.role === 'INVESTOR'
    ? await prisma.investor.findUnique({ where: { userId: user.id }, select: { id: true } })
    : null;

  return {
    ok: true,
    user: { id: user.id, role: user.role, name: user.name, email: user.email, investorId: investor?.id ?? null },
  };
}

export async function logout(ip?: string | null): Promise<void> {
  const user = await getSessionUser();
  await destroySession();
  if (user) await audit({ action: 'AUTH_LOGOUT', actorUserId: user.id, ip });
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
      const exists = await prisma.investor.findUnique({
        where: { id: impersonatedInvestorId },
        select: { id: true },
      });
      if (exists) {
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
