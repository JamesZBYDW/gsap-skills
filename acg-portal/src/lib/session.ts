import 'server-only';
import { randomBytes, createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from '@/server/db/client';
import { newId, type D1Database, type D1PreparedStatement } from '@/server/db/d1';
import { findSessionByTokenHash } from '@/server/db/repo';

export const SESSION_COOKIE = 'acg_session';
/** Pending second-factor challenge (not a session; grants nothing by itself). */
export const MFA_CHALLENGE_COOKIE = 'acg_mfa';
export const IMPERSONATE_COOKIE = 'acg_impersonate';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax' as const,
    path: '/',
  };
}

export interface NewSession {
  /** The opaque cookie value; only its SHA-256 hash is stored. */
  token: string;
  tokenHash: string;
  expiresAt: Date;
  /** INSERT for the session row, to include in the caller's batch. */
  statement: D1PreparedStatement;
}

/**
 * Prepare a DB-backed session for `userId` (written by the caller's batch).
 * With `guard`, the row is only inserted if, when the batch commits, the user
 * still has that password hash and is not locked.
 */
export function prepareSession(
  database: D1Database,
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
  at = Date.now(),
  guard?: { passwordHash: string; extraCondition?: string; extraParams?: unknown[] },
): NewSession {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = sha256(token);
  const expiresAt = new Date(at + SESSION_TTL_MS);
  const values = [newId(), tokenHash, userId, expiresAt.getTime(), at, meta.ip ?? null, meta.userAgent?.slice(0, 512) ?? null];
  const statement = guard
    ? database
        .prepare(
          `INSERT INTO sessions (id, token_hash, user_id, expires_at, created_at, ip, user_agent)
           SELECT ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND password_hash = ?
                         AND (locked_until IS NULL OR locked_until <= ?))
             AND ${guard.extraCondition ?? '1'}`,
        )
        .bind(...values, userId, guard.passwordHash, at, ...(guard.extraParams ?? []))
    : database
        .prepare('INSERT INTO sessions (id, token_hash, user_id, expires_at, created_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(...values);
  return { token, tokenHash, expiresAt, statement };
}

/** Set the session cookie for a session whose row has been written. */
export async function setSessionCookie(session: Pick<NewSession, 'token' | 'expiresAt'>): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.token, { ...baseCookieOptions(), expires: session.expiresAt });
}

/** Set the short-lived cookie that identifies a pending 2FA challenge. */
export async function setMfaChallengeCookie(challenge: { token: string; expiresAt: Date }): Promise<void> {
  const jar = await cookies();
  jar.set(MFA_CHALLENGE_COOKIE, challenge.token, { ...baseCookieOptions(), sameSite: 'strict', expires: challenge.expiresAt });
}

export async function getMfaChallengeToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(MFA_CHALLENGE_COOKIE)?.value ?? null;
}

export async function clearMfaChallengeCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(MFA_CHALLENGE_COOKIE);
}

/** Destroy the current session (cookie + DB row) and clear impersonation. */
export async function destroySession(database: D1Database = db()): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await database.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(sha256(token)).run();
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(IMPERSONATE_COOKIE);
}

export interface SessionUser {
  id: string;
  role: 'INVESTOR' | 'TEAM';
  name: string;
  email: string;
  investorId: string | null;
  mustChangePassword: boolean;
}

/** Resolve the user for a session token, deleting the row if it expired. */
export async function sessionUserForToken(
  database: D1Database,
  token: string,
  now = Date.now(),
): Promise<SessionUser | null> {
  const session = await findSessionByTokenHash(database, sha256(token));
  if (!session) return null;
  if (session.expiresAt.getTime() < now) {
    await database.prepare('DELETE FROM sessions WHERE id = ?').bind(session.sessionId).run().catch(() => {});
    return null;
  }
  const u = session.user;
  return {
    id: u.id,
    role: u.role,
    name: u.name,
    email: u.email,
    investorId: session.investorId,
    mustChangePassword: u.mustChangePassword,
  };
}

/** Resolve the current authenticated user from the session cookie, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return sessionUserForToken(db(), token);
}

/**
 * Read the impersonation target (an investorId) — only meaningful for TEAM
 * users. The value is validated against the session role by callers.
 */
export async function getImpersonatedInvestorId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(IMPERSONATE_COOKIE)?.value ?? null;
}

export async function setImpersonation(investorId: string): Promise<void> {
  const jar = await cookies();
  jar.set(IMPERSONATE_COOKIE, investorId, { ...baseCookieOptions() });
}

export async function clearImpersonation(): Promise<void> {
  const jar = await cookies();
  jar.delete(IMPERSONATE_COOKIE);
}

/** Remove expired sessions (call from a scheduled job). */
export async function pruneExpiredSessions(database: D1Database = db(), now = Date.now()): Promise<number> {
  const res = await database.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run();
  return Number(res.meta.changes ?? 0);
}
