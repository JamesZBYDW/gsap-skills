import 'server-only';
import { prisma } from './db';

export type AuditAction =
  | 'AUTH_LOGIN'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_LOGOUT'
  | 'AUTH_LOCKOUT'
  | 'AUTH_REGISTER'
  | 'INVESTOR_CREATE'
  | 'INVESTOR_STATE_CHANGE'
  | 'NOTE_TERMS_SET'
  | 'CREDENTIALS_SET'
  | 'PASSWORD_CHANGE'
  | 'BANKING_EDIT'
  | 'NOTIF_PREF_CHANGE'
  | 'DOCUMENT_DOWNLOAD'
  | 'IMPERSONATION_START'
  | 'IMPERSONATION_END';

export interface AuditInput {
  action: AuditAction;
  actorUserId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
}

/**
 * Write an immutable audit record. State changes, banking edits, approvals and
 * auth events MUST be audited (compliance — see DESIGN_HANDOFF.md "Compliance").
 * Failures are logged but never thrown back into the request path.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        actorUserId: input.actorUserId ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: (input.metadata ?? undefined) as object | undefined,
        ip: input.ip ?? null,
      },
    });
  } catch (err) {
    console.error('[audit] failed to write audit log', input.action, err);
  }
}
