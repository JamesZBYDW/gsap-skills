import 'server-only';
import { newId, safeErrorSummary, type D1Database, type D1PreparedStatement } from '@/server/db/d1';

export type AuditAction =
  | 'AUTH_LOGIN'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_LOGOUT'
  | 'AUTH_LOCKOUT'
  | 'AUTH_REGISTER'
  | 'ADMIN_BOOTSTRAP'
  | 'INVESTOR_CREATE'
  | 'INVESTOR_STATE_CHANGE'
  | 'NOTE_TERMS_SET'
  | 'CREDENTIALS_SET'
  | 'PASSWORD_CHANGE'
  | 'PROFILE_EDIT'
  | 'BANKING_EDIT'
  | 'NOTIF_PREF_CHANGE'
  | 'DOCUMENT_DOWNLOAD'
  | 'IMPERSONATION_START'
  | 'IMPERSONATION_END'
  | 'AUTH_MFA_CHALLENGE'
  | 'AUTH_MFA_FAILED'
  | 'AUTH_MFA_RECOVERY_USED'
  | 'MFA_ENROLL_STARTED'
  | 'MFA_ENABLED'
  | 'MFA_DISABLED'
  | 'MFA_RECOVERY_REGENERATED';

export interface AuditInput {
  action: AuditAction;
  actorUserId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
}

const INSERT = `INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, metadata, ip, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

function values(input: AuditInput, at: number): unknown[] {
  return [
    newId(),
    input.actorUserId ?? null,
    input.action,
    input.targetType ?? null,
    input.targetId ?? null,
    input.metadata ? JSON.stringify(input.metadata) : null,
    input.ip ?? null,
    at,
  ];
}

/**
 * An audit INSERT to include in a write `batch()`, so the record commits (or
 * rolls back) together with the change it describes.
 */
export function auditStmt(database: D1Database, input: AuditInput, at = Date.now()): D1PreparedStatement {
  return database.prepare(INSERT).bind(...values(input, at));
}

/**
 * An audit INSERT that only takes effect when `condition` (SQL, evaluated in
 * the same batch, before later statements) is true.
 */
export function auditStmtIf(
  database: D1Database,
  input: AuditInput,
  condition: string,
  conditionParams: unknown[],
  at = Date.now(),
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, metadata, ip, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${condition}`,
    )
    .bind(...values(input, at), ...conditionParams);
}

/**
 * Write a standalone audit record (events with no accompanying data change,
 * e.g. a failed login or a download). Failures are logged — by category only,
 * never with SQL or values — and never thrown into the request path.
 */
export async function audit(database: D1Database, input: AuditInput): Promise<void> {
  try {
    await auditStmt(database, input).run();
  } catch (err) {
    console.error('[audit] failed to write audit log', input.action, safeErrorSummary(err));
  }
}
