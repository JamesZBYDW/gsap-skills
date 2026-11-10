import { createHmac } from 'node:crypto';
import type { D1Database } from '../db/d1';

/** The random reset ID can be queued. Only the dispatch Worker can reconstruct its bearer token. */
export function passwordEmailToken(resetId: string, secret: string): string {
  if (!secret || secret.length < 32) throw new Error('Email link secret is unavailable');
  return createHmac('sha256', secret).update(`ACG:account-link:v1:${resetId}`).digest('base64url');
}

export function accountEmailStatement(db: D1Database, kind: 'invite' | 'reset', resetId: string, nowMs: number) {
  return db.prepare(`INSERT INTO email_outbox (id, kind, user_id, recipient, source_id, created_at, available_at)
    SELECT ?, ?, u.id, u.email, r.id, ?, ? FROM password_resets r JOIN users u ON u.id = r.user_id
    WHERE r.id = ? AND r.used_at IS NULL AND r.expires_at > ? ON CONFLICT(id) DO NOTHING`)
    .bind(`${kind}:${resetId}`, kind, nowMs, nowMs, resetId, nowMs);
}

export function paymentEmailStatement(db: D1Database, distributionId: string, uniqueAuditId: string, nowMs: number) {
  return db.prepare(`INSERT INTO email_outbox (id, kind, user_id, recipient, source_id, created_at, available_at)
    SELECT ?, 'payment', u.id, u.email, d.id, ?, ?
    FROM distributions d JOIN notes n ON n.id = d.note_id JOIN investors i ON i.id = n.investor_id
    JOIN users u ON u.id = i.user_id AND u.role = 'INVESTOR'
    LEFT JOIN notif_prefs p ON p.investor_id = i.id
    JOIN audit_logs a ON a.target_type = 'Distribution' AND a.target_id = d.id AND a.id = ? AND a.action = 'DISTRIBUTION_PAID'
    WHERE d.id = ? AND d.paid_date IS NOT NULL AND COALESCE(p.distribution_posted, 1) = 1
    ON CONFLICT(id) DO NOTHING`).bind(`payment:${distributionId}`, nowMs, nowMs, uniqueAuditId, distributionId);
}

export const DAY = 86_400_000;
export const utcToday = (ms: number) => Math.floor(ms / DAY) * DAY;

export function maturityEmailStatement(db: D1Database, nowMs: number) {
  const today = utcToday(nowMs);
  return db.prepare(`INSERT INTO email_outbox (id, kind, user_id, recipient, source_id, maturity_date, created_at, available_at)
    SELECT 'maturity:' || n.id || ':' || n.maturity_date, 'maturity', u.id, u.email, n.id, n.maturity_date, ?, ?
    FROM notes n JOIN investors i ON i.id = n.investor_id JOIN users u ON u.id = i.user_id AND u.role = 'INVESTOR'
    LEFT JOIN notif_prefs p ON p.investor_id = i.id
    WHERE n.status = 'ACTIVE' AND n.maturity_date BETWEEN ? AND ? AND COALESCE(p.maturity_reminder, 1) = 1
      AND NOT EXISTS (SELECT 1 FROM email_outbox e WHERE e.id = 'maturity:' || n.id || ':' || n.maturity_date)
    ORDER BY n.maturity_date, n.id LIMIT 100 ON CONFLICT(id) DO NOTHING`).bind(nowMs, nowMs, today, today + 90 * DAY);
}
