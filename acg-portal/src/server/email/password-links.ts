import 'server-only';
import { createHash } from 'node:crypto';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { newId, type D1Database } from '@/server/db/d1';
import { hashPassword } from '@/lib/password-core';
import { HttpError } from '@/lib/http';
import { accountEmailStatement, passwordEmailToken } from './outbox';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export function emailLinkSecret(): string {
  const { EMAIL_LINK_SECRET } = getCloudflareContext().env as { EMAIL_LINK_SECRET?: string };
  if (!EMAIL_LINK_SECRET || EMAIL_LINK_SECRET.length < 32)
    throw new HttpError(503, 'Email setup is temporarily unavailable.');
  return EMAIL_LINK_SECRET;
}

export function passwordLinkStatements(
  database: D1Database,
  email: string,
  kind: 'invite' | 'reset',
  secret: string,
  now: number,
  investorId: string | null = null,
  actor: string | null = null,
) {
  const id = newId();
  const expires = now + (kind === 'invite' ? 48 * 60 : 30) * 60_000;
  return [
    database
      .prepare(
        `INSERT INTO password_resets (id,token_hash,user_id,expires_at,created_at)
        SELECT ?,?,id,?,? FROM users WHERE email = ? AND (? IS NULL OR EXISTS (SELECT 1 FROM investors WHERE id=? AND user_id=users.id))`,
      )
      .bind(id, digest(passwordEmailToken(id, secret)), expires, now, email, investorId, investorId),
    database
      .prepare(
        `INSERT INTO audit_logs(id,actor_user_id,action,target_type,target_id,metadata,created_at)
      SELECT ?,?,'PASSWORD_LINK_REQUESTED','User',user_id,json_object('kind',?),? FROM password_resets WHERE id=?`,
      )
      .bind(newId(), actor, kind, now, id),
    accountEmailStatement(database, kind, id, now),
  ];
}

export async function redeemPasswordLink(
  database: D1Database,
  token: string,
  password: string,
  ip: string | null,
) {
  const tokenHash = digest(token);
  const invalid = () =>
    new HttpError(400, 'This link has expired or was already used. Request a new password link.');
  const row = await database
    .prepare('SELECT user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?')
    .bind(tokenHash, Date.now())
    .first<{ user_id: string }>();
  if (!row) throw invalid();
  const hash = await hashPassword(password);
  const now = Date.now();
  // Updating the password invalidates all outstanding links inside this transaction.
  const [result] = await database.batch([
    database
      .prepare(
        `UPDATE users SET password_hash=?, must_change_password=0, failed_login_attempts=0, locked_until=NULL, updated_at=?
      WHERE id=? AND EXISTS (SELECT 1 FROM password_resets WHERE user_id=users.id AND token_hash=? AND used_at IS NULL AND expires_at>?)`,
      )
      .bind(hash, now, row.user_id, tokenHash, now),
    database
      .prepare(
        `DELETE FROM sessions WHERE user_id=? AND EXISTS (SELECT 1 FROM users WHERE id=? AND password_hash=?)`,
      )
      .bind(row.user_id, row.user_id, hash),
    database
      .prepare(
        `INSERT INTO audit_logs (id,actor_user_id,action,target_type,target_id,metadata,ip,created_at)
      SELECT ?,id,'PASSWORD_CHANGE','User',id,'{"via":"email_link"}',?,? FROM users WHERE id=? AND password_hash=?`,
      )
      .bind(newId(), ip, now, row.user_id, hash),
  ]);
  if (!result?.meta.changes) throw invalid();
}
