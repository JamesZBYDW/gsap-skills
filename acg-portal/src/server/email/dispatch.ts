import { createHash, randomUUID } from 'node:crypto';
import type { D1Database } from '../db/d1';
import { DAY, maturityEmailStatement, passwordEmailToken, utcToday } from './outbox';

interface Message {
  to: string;
  from: string;
  subject: string;
  text: string;
}

export interface PortalEmailEnv {
  DB: D1Database;
  ACG_EMAIL?: { send(message: Message): Promise<{ messageId: string }> };
  EMAIL_FROM?: string;
  EMAIL_LINK_SECRET?: string;
  APP_URL?: string;
}

type Kind = 'invite' | 'reset' | 'payment' | 'maturity';
interface Job {
  id: string;
  kind: Kind;
  source_id: string;
  recipient: string;
}

// Recheck the current address, ownership, source event and preferences in the very
// write that reserves this delivery. Concurrent cron invocations cannot both claim it.
function eligibility(job: Job, token: string, now: number): { sql: string; args: (number | string)[] } {
  if (job.kind === 'invite' || job.kind === 'reset') {
    return {
      sql: `EXISTS (SELECT 1 FROM password_resets r WHERE r.id = email_outbox.source_id
        AND r.user_id = email_outbox.user_id AND r.used_at IS NULL AND r.expires_at > ? AND r.token_hash = ?)`,
      args: [now, createHash('sha256').update(token).digest('hex')],
    };
  }
  const ownedNote = `FROM notes n JOIN investors i ON i.id = n.investor_id LEFT JOIN notif_prefs p ON p.investor_id = i.id`;
  if (job.kind === 'payment') {
    return {
      sql: `EXISTS (SELECT 1 ${ownedNote} JOIN distributions d ON d.note_id = n.id
        WHERE i.user_id = email_outbox.user_id AND d.id = email_outbox.source_id AND d.paid_date IS NOT NULL
          AND COALESCE(p.distribution_posted, 1) = 1)`,
      args: [],
    };
  }
  return {
    sql: `EXISTS (SELECT 1 ${ownedNote} WHERE i.user_id = email_outbox.user_id AND n.id = email_outbox.source_id
      AND n.status = 'ACTIVE' AND n.maturity_date = email_outbox.maturity_date
      AND n.maturity_date BETWEEN ? AND ? AND COALESCE(p.maturity_reminder, 1) = 1)`,
    args: [utcToday(now), utcToday(now) + 90 * DAY],
  };
}

function messageFor(job: Job, token: string, origin: string, from: string): Message {
  const link = `${origin}/set-password#token=${token}`;
  const messages: Record<Kind, [string, string]> = {
    invite: ['Your ACG Investor Portal invitation', `Investor Relations has created your portal account. Use this private link to set your password:\n\n${link}`],
    reset: ['Reset your ACG portal password', `Use this private link to choose a new password:\n\n${link}\n\nIf you did not request a password reset, you can ignore this email.`],
    payment: ['Distribution recorded in your ACG portal', `Investor Relations has recorded a distribution on your note. Sign in to review it:\n\n${origin}/portal/overview`],
    maturity: ['Your ACG note is approaching maturity', `Your note is within 90 days of its maturity date. Sign in to review your schedule and contact Investor Relations with any questions:\n\n${origin}/portal/overview`],
  };
  const [subject, body] = messages[job.kind];
  return { from, to: job.recipient, subject, text: `${body}\n\nAmsterdam Capital Group · Investor Relations` };
}

const MINUTE = 60_000;
type Outcome = { state: 'accepted' | 'pending' | 'failed' | 'uncertain'; code: string | null; providerId?: string; delay?: number };

function providerFailure(error: unknown, attempts: number): Outcome {
  const code = (error as { code?: unknown } | null)?.code;
  // Retry only documented rejections that prove the provider didn't accept the email.
  if (code === 'E_RATE_LIMIT_EXCEEDED' || code === 'E_DAILY_LIMIT_EXCEEDED' || code === 'E_SENDER_NOT_VERIFIED' || code === 'E_SENDER_DOMAIN_NOT_AVAILABLE') {
    const delay = code === 'E_DAILY_LIMIT_EXCEEDED' ? DAY : Math.min(60, 2 ** attempts) * MINUTE;
    return { state: attempts >= 8 ? 'failed' : 'pending', code, delay };
  }
  if (typeof code === 'string' && ['E_RECIPIENT_SUPPRESSED', 'E_RECIPIENT_NOT_ALLOWED', 'E_ACCOUNT_SUSPENDED', 'E_DELIVERY_FAILED', 'E_VALIDATION_ERROR', 'E_FIELD_MISSING', 'E_CONTENT_TOO_LARGE'].includes(code)) {
    return { state: 'failed', code };
  }
  // The binding offers no idempotency key. A lost acknowledgement may be an
  // accepted message, so preserve it for operator review instead of resending.
  return { state: 'uncertain', code: 'provider_ack_unknown' };
}

async function settle(db: D1Database, id: string, claim: string, outcome: Outcome, now: number) {
  const guard = "id = ? AND claim_id = ? AND state IN ('sending','uncertain')";
  await db.batch([
    db.prepare(`INSERT INTO audit_logs (id,action,target_type,target_id,metadata,created_at)
      SELECT ?, 'EMAIL_DISPATCH', 'Email', id, json_object('kind',kind,'state',?,'code',?), ? FROM email_outbox WHERE ${guard}`)
      .bind(randomUUID(), outcome.state, outcome.code, now, id, claim),
    db.prepare(`UPDATE email_outbox SET state = ?, result_code = ?, provider_id = ?, available_at = ?, completed_at = ? WHERE ${guard}`)
      .bind(outcome.state, outcome.code, outcome.providerId ?? null, now + (outcome.delay ?? 0), outcome.state === 'pending' ? null : now, id, claim),
  ]);
}

/** Scheduled Worker entry. Each invocation makes bounded progress; all state lives in D1. */
export async function runPortalEmail(env: PortalEmailEnv, clock: () => number = Date.now): Promise<void> {
  const { DB: db, ACG_EMAIL: transport, EMAIL_FROM: sender, EMAIL_LINK_SECRET: secret } = env;
  if (!transport || !sender || !secret || secret.length < 32 || !env.APP_URL) throw new Error('Portal email configuration is incomplete');
  const url = new URL(env.APP_URL);
  if (url.protocol !== 'https:') throw new Error('Portal email links require HTTPS');
  const now = clock();
  await db.batch([
    maturityEmailStatement(db, now),
    db.prepare(`UPDATE email_outbox SET state = 'uncertain', result_code = 'interrupted_dispatch', completed_at = ?
      WHERE state = 'sending' AND last_attempt_at < ?`).bind(now, now - 20 * MINUTE),
  ]);
  const jobs = await db.prepare(`SELECT id, kind, source_id, recipient FROM email_outbox
    WHERE state = 'pending' AND available_at <= ? ORDER BY CASE WHEN kind IN ('invite','reset') THEN 0 ELSE 1 END,
    available_at, created_at, id LIMIT 20`).bind(now).all<Job>();
  for (const job of jobs.results) {
    const at = clock();
    const claim = randomUUID();
    const token = job.kind === 'invite' || job.kind === 'reset' ? passwordEmailToken(job.source_id, secret) : '';
    const eligible = eligibility(job, token, at);
    const claimed = await db.prepare(`UPDATE email_outbox SET state = CASE WHEN
      EXISTS (SELECT 1 FROM users u WHERE u.id = email_outbox.user_id AND u.email = email_outbox.recipient)
      AND ${eligible.sql} THEN 'sending' ELSE 'skipped' END,
      claim_id = ?, attempts = attempts + 1, last_attempt_at = ?
      WHERE id = ? AND state = 'pending' AND available_at <= ? RETURNING state, attempts`)
      .bind(...eligible.args, claim, at, job.id, at).first<{ state: string; attempts: number }>();
    if (claimed?.state !== 'sending') continue;
    let outcome: Outcome;
    try {
      const receipt = await transport.send(messageFor(job, token, url.origin, sender));
      outcome = typeof receipt?.messageId === 'string' && receipt.messageId.length > 0
        ? { state: 'accepted', code: null, providerId: receipt.messageId }
        : { state: 'uncertain', code: 'missing_provider_receipt' };
    } catch (error) {
      outcome = providerFailure(error, claimed.attempts);
    }
    // A failure recording an acknowledgement must never requeue a delivered message.
    await settle(db, job.id, claim, outcome, clock());
  }
}
