import 'server-only';
import { randomBytes, createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from './db';

export const SESSION_COOKIE = 'acg_session';
export const IMPERSONATE_COOKIE = 'acg_impersonate';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function sha256(value: string): string {
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

/** Create a DB-backed session and set the session cookie. Returns the token. */
export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { ...baseCookieOptions(), expires: expiresAt });
}

/** Destroy the current session (cookie + DB row) and clear impersonation. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
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
}

/** Resolve the current authenticated user from the session cookie, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { investor: { select: { id: true } } } } },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    }
    return null;
  }

  const u = session.user;
  return {
    id: u.id,
    role: u.role,
    name: u.name,
    email: u.email,
    investorId: u.investor?.id ?? null,
  };
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

/** Remove expired sessions (call from a scheduled job in production). */
export async function pruneExpiredSessions(): Promise<number> {
  const res = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return res.count;
}
