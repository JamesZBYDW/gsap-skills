import 'server-only';
import { randomBytes, createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from '@/server/db/client';
import { newId, type D1Database, type D1PreparedStatement } from '@/server/db/d1';
import { findSessionByTokenHash } from '@/server/db/repo';

export const SESSION_COOKIE = 'acg_session';
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
  expiresAt: Date;
  /** INSERT for the session row, to include in the login batch. */
  statement: D1PreparedStatement;
}

/** Prepare a DB-backed session for `userId` (written by the caller's batch). */
export function prepareSession(
  database: D1Database,
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
  at = Date.now(),
): NewSession {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(at + SESSION_TTL_MS);
  const statement = database
    .prepare(
      'INSERT INTO sessions (id, token_hash, user_id, expires_at, created_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(newId(), sha256(token), userId, expiresAt.getTime(), at, meta.ip ?? null, meta.userAgent?.slice(0, 512) ?? null);
  return { token, expiresAt, statement };
}

/** Set the session cookie for a session whose row has been written. */
export async function setSessionCookie(session: Pick<NewSession, 'token' | 'expiresAt'>): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.token, { ...baseCookieOptions(), expires: session.expiresAt });
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
