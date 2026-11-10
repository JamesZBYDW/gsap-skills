import 'server-only';
import { db } from '@/server/db/client';
import { emailLinkSecret, passwordLinkStatements } from '@/server/email/password-links';
import { isUniqueViolation, msOrNull, newId, type D1Database, type D1PreparedStatement } from '@/server/db/d1';
import { findUserByEmail, findUserById, getInvestor } from '@/server/db/repo';
import {
  generateScheduleBetween,
  computeMaturity,
  DISTRIBUTION_INTERVAL_DAYS,
  type GeneratedDistribution,
} from '@/lib/schedule';
import { monthlyDistributionCents } from '@/lib/money';
import { parseISODate, addDays } from '@/lib/dates';
import { hashPassword, verifyPassword } from '@/lib/password';
import { auditStmt, auditStmtIf } from '@/lib/audit';
import { HttpError } from '@/lib/http';
import type { InvestorType } from '@/lib/domain';
import type { NoteTermsInput, CreateAccountInput, InvestorProfileInput } from '@/lib/validation';

// Every management write below is ONE D1 `batch()`: D1 runs a batch as a
// single SQL transaction, so the data change and its audit records commit
// together or not at all. (D1 ignores interactive/implicit transactions, so
// nothing here relies on them.) Statements that depend on earlier ones in the
// same batch use sub-selects rather than values read beforehand, so two
// concurrent requests can only ever leave one request's complete result.

const EMAIL_IN_USE = 'That login email is already in use.';

// ─── Note terms (management sets these; drives the investor schedule) ────────

export interface NoteTermsPlan {
  principalCents: number;
  rateBps: number;
  termMonths: number;
  amountCents: number;
  wireDate: Date | null;
  first: Date | null;
  maturity: Date | null;
  status: 'ACTIVE' | 'AWAITING';
  /** Distributions to (re)create; empty while awaiting the wire. */
  planned: GeneratedDistribution[];
}

/**
 * Everything derives from the wire-received date: amount = principal × rate ÷
 * 12; first distribution = wire + 30 days, then every 30 days through
 * maturity (wire + term), the final one also returning the principal; status
 * is Active the moment a wire date is set (Expired is derived at read time).
 */
export function planNoteTerms(input: NoteTermsInput): NoteTermsPlan {
  const rateBps = Math.round(input.ratePercent * 100);
  const principalCents = input.principal ?? 0;
  const termMonths = input.termMonths;
  const amountCents = monthlyDistributionCents(principalCents, rateBps);
  const wireDate = parseISODate(input.wireReceivedDate);
  const first = wireDate ? addDays(wireDate, DISTRIBUTION_INTERVAL_DAYS) : null;
  const maturity = wireDate ? computeMaturity(wireDate, termMonths) : null;
  const active = !!wireDate;

  if (active) {
    if (principalCents <= 0) throw new HttpError(400, 'Enter the principal before recording the wire.');
    if (amountCents <= 0) throw new HttpError(400, 'Set a fixed rate before recording the wire.');
  }

  return {
    principalCents,
    rateBps,
    termMonths,
    amountCents,
    wireDate,
    first,
    maturity,
    status: active ? 'ACTIVE' : 'AWAITING',
    planned: active && first ? generateScheduleBetween(first, amountCents, maturity, principalCents) : [],
  };
}

/**
 * Reconcile the proposed schedule in the same D1 transaction as the note.
 * A posted payment survives when its index, due date and full amount match.
 * If it would change or disappear, the paid-row deletion trigger aborts the
 * batch. Unpaid rows receive new IDs so stale payment selections fail safely.
 */
export function noteTermsStatements(
  database: D1Database,
  investorId: string,
  plan: NoteTermsPlan,
  actorUserId: string,
  ip: string | null,
  at = Date.now(),
): D1PreparedStatement[] {
  const noteIdOf = '(SELECT id FROM notes WHERE investor_id = ?)';
  const proposed = JSON.stringify(plan.planned.map((d) => ({
    index: d.index, due: d.dueDate.getTime(), amount: d.amountCents,
  })));
  return [
    database.prepare('UPDATE investors SET state = ?, updated_at = ? WHERE id = ?').bind(plan.status, at, investorId),
    database
      .prepare(
        `INSERT INTO notes (id, investor_id, principal_cents, rate_bps, term_months, monthly_amount_cents,
                            wire_date, first_distribution_date, maturity_date, distribution_day, status,
                            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (investor_id) DO UPDATE SET
           principal_cents = excluded.principal_cents,
           rate_bps = excluded.rate_bps,
           term_months = excluded.term_months,
           monthly_amount_cents = excluded.monthly_amount_cents,
           wire_date = excluded.wire_date,
           first_distribution_date = excluded.first_distribution_date,
           maturity_date = excluded.maturity_date,
           distribution_day = excluded.distribution_day,
           status = excluded.status,
           updated_at = excluded.updated_at`,
      )
      .bind(
        newId(),
        investorId,
        plan.principalCents,
        plan.rateBps,
        plan.termMonths,
        plan.amountCents,
        msOrNull(plan.wireDate),
        msOrNull(plan.first),
        msOrNull(plan.maturity),
        plan.first ? plan.first.getUTCDate() : 1,
        plan.status,
        at,
        at,
      ),
    database.prepare(
      `DELETE FROM distributions AS d
       WHERE d.note_id = ${noteIdOf}
         AND (d.paid_date IS NULL OR NOT EXISTS (
           SELECT 1 FROM json_each(?) AS p
           WHERE d.idx = json_extract(p.value, '$.index')
             AND d.due_date = json_extract(p.value, '$.due')
             AND d.amount_cents = json_extract(p.value, '$.amount')
         ))`,
    ).bind(investorId, proposed),
    ...plan.planned.map((d) =>
      database
        .prepare(
          `INSERT INTO distributions (id, note_id, idx, due_date, amount_cents)
           SELECT ?, n.id, ?, ?, ? FROM notes AS n
           WHERE n.investor_id = ? AND NOT EXISTS (
             SELECT 1 FROM distributions AS d WHERE d.note_id = n.id AND d.idx = ? AND d.paid_date IS NOT NULL
           )`,
        )
        .bind(newId(), d.index, d.dueDate.getTime(), d.amountCents, investorId, d.index),
    ),
    auditStmt(
      database,
      {
        action: 'NOTE_TERMS_SET',
        actorUserId,
        targetType: 'Investor',
        targetId: investorId,
        metadata: {
          status: plan.status,
          rateBps: plan.rateBps,
          principalCents: plan.principalCents,
          amountCents: plan.amountCents,
          distributions: plan.planned.length,
        },
        ip,
      },
      at,
    ),
    auditStmt(
      database,
      { action: 'INVESTOR_STATE_CHANGE', actorUserId, targetType: 'Investor', targetId: investorId, metadata: { to: plan.status }, ip },
      at,
    ),
  ];
}

export async function setNoteTerms(
  investorId: string,
  input: NoteTermsInput,
  actorUserId: string,
  ip: string | null,
  database: D1Database = db(),
) {
  if (!(await getInvestor(database, investorId))) throw new HttpError(404, 'Investor not found.');
  const plan = planNoteTerms(input);
  // The note's foreign key also rejects an investor deleted in between.
  try {
    await database.batch(noteTermsStatements(database, investorId, plan, actorUserId, ip));
  } catch (err) {
    if (err instanceof Error && err.message.includes('posted distribution is locked')) {
      throw new HttpError(409, 'These terms would change or remove a recorded distribution. Keep its distribution number, due date and amount, including any returned principal.');
    }
    throw err;
  }
}

// ─── Credentials ─────────────────────────────────────────────────────────────

/**
 * Statements that give an investor a login (new user) or reset the existing
 * one, revoking that login's existing sessions. Both branches are written so
 * the batch is correct whatever the state is when it commits: the INSERT and
 * the link only apply if the investor still has no login; the UPDATE and the
 * session revocation then apply to whichever login is linked. A login email
 * already used by another account violates `users.email` UNIQUE and rolls
 * back the whole batch.
 */
export function credentialStatements(
  database: D1Database,
  investorId: string,
  creds: { loginEmail: string; passwordHash: string; mustChange: boolean },
  actorUserId: string,
  ip: string | null,
  at = Date.now(),
): D1PreparedStatement[] {
  const userId = newId();
  const must = creds.mustChange ? 1 : 0;
  return [
    database
      .prepare(
        `INSERT INTO users (id, role, name, email, password_hash, must_change_password, failed_login_attempts,
                            locked_until, created_at, updated_at)
         SELECT ?, 'INVESTOR', legal_name, ?, ?, ?, 0, NULL, ?, ?
         FROM investors WHERE id = ? AND user_id IS NULL`,
      )
      .bind(userId, creds.loginEmail, creds.passwordHash, must, at, at, investorId),
    database
      .prepare(
        `UPDATE investors SET user_id = ?, updated_at = ?
         WHERE id = ? AND user_id IS NULL AND EXISTS (SELECT 1 FROM users WHERE id = ?)`,
      )
      .bind(userId, at, investorId, userId),
    database
      .prepare(
        `UPDATE users SET email = ?, password_hash = ?, must_change_password = ?, failed_login_attempts = 0,
                          locked_until = NULL, updated_at = ?
         WHERE id = (SELECT user_id FROM investors WHERE id = ?)`,
      )
      .bind(creds.loginEmail, creds.passwordHash, must, at, investorId),
    // New credentials end every existing session of that login.
    database.prepare('DELETE FROM sessions WHERE user_id = (SELECT user_id FROM investors WHERE id = ?)').bind(investorId),
    auditStmt(
      database,
      { action: 'CREDENTIALS_SET', actorUserId, targetType: 'Investor', targetId: investorId, metadata: { email: creds.loginEmail }, ip },
      at,
    ),
  ];
}

/** Management provisions or resets an investor's login. */
export async function provisionCredentials(
  investorId: string,
  input: { email?: string; password: string; mustChange?: boolean },
  actorUserId: string,
  ip: string | null,
  database: D1Database = db(),
) {
  const investor = await getInvestor(database, investorId);
  if (!investor) throw new HttpError(404, 'Investor not found.');

  const loginEmail = (input.email ?? investor.email).toLowerCase();
  if (!loginEmail || !loginEmail.includes('@')) throw new HttpError(400, 'A valid login email is required.');

  // Fast, friendly check; the UNIQUE constraint is the real guarantee.
  const clash = await findUserByEmail(database, loginEmail);
  if (clash && clash.id !== investor.userId) throw new HttpError(409, EMAIL_IN_USE);

  const passwordHash = await hashPassword(input.password);
  try {
    await database.batch(
      credentialStatements(database, investorId, { loginEmail, passwordHash, mustChange: !!input.mustChange }, actorUserId, ip),
    );
  } catch (err) {
    if (isUniqueViolation(err, 'users.email')) throw new HttpError(409, EMAIL_IN_USE);
    throw err;
  }
}

// ─── Investor creation ────────────────────────────────────────────────────

/**
 * Create an entire investor account — the investor, its note terms and
 * schedule, and the sign-in credentials — in ONE batch. If the login email is
 * taken (including by a concurrent request), nothing is written and the
 * caller gets 409.
 */
export async function createInvestorAccount(
  input: CreateAccountInput,
  actorUserId: string,
  ip: string | null,
  database: D1Database = db(),
): Promise<{ id: string }> {
  const loginEmail = (input.loginEmail ?? input.email).toLowerCase();
  if (!loginEmail.includes('@')) throw new HttpError(400, 'A valid login email is required.');
  const plan = planNoteTerms({
    principal: input.principal,
    ratePercent: input.ratePercent,
    termMonths: input.termMonths,
    wireReceivedDate: input.wireReceivedDate,
  });
  if (await findUserByEmail(database, loginEmail)) throw new HttpError(409, EMAIL_IN_USE);

  const passwordHash = await hashPassword(input.password);
  const investorId = newId();
  const at = Date.now();

  const statements = [
    database
      .prepare(
        `INSERT INTO investors (id, legal_name, type, email, phone, state, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'AWAITING', NULL, ?, ?)`,
      )
      .bind(investorId, input.name, input.type as InvestorType, input.email, input.phone ?? null, at, at),
    auditStmt(database, { action: 'INVESTOR_CREATE', actorUserId, targetType: 'Investor', targetId: investorId, ip }, at),
    ...noteTermsStatements(database, investorId, plan, actorUserId, ip, at),
    ...credentialStatements(database, investorId, { loginEmail, passwordHash, mustChange: !!input.mustChange }, actorUserId, ip, at),
  ];
  if (input.sendInvite) {
    statements.push(...passwordLinkStatements(database, loginEmail, 'invite', emailLinkSecret(), at, investorId, actorUserId));
  }

  try {
    await database.batch(statements);
  } catch (err) {
    if (isUniqueViolation(err, 'users.email')) throw new HttpError(409, EMAIL_IN_USE);
    throw err;
  }
  return { id: investorId };
}

// ─── Profile (management edits what the investor sees on their Profile) ─────

/**
 * Management updates an investor's profile: identity/contact details and the
 * banking on file (recorded after the phone confirmation compliance
 * requires). One batch; BANKING_EDIT is audited only when the banking actually
 * changes, decided inside the batch against the pre-update row.
 */
export async function updateInvestorProfile(
  investorId: string,
  input: InvestorProfileInput,
  actorUserId: string,
  ip: string | null,
  database: D1Database = db(),
) {
  if (!(await getInvestor(database, investorId))) throw new HttpError(404, 'Investor not found.');
  await database.batch(profileStatements(database, investorId, input, actorUserId, ip));
}

export function profileStatements(
  database: D1Database,
  investorId: string,
  input: InvestorProfileInput,
  actorUserId: string,
  ip: string | null,
  at = Date.now(),
): D1PreparedStatement[] {
  const hasBanking = !!(input.bankName && input.bankLast4);
  const bankingAudit = {
    action: 'BANKING_EDIT' as const,
    actorUserId,
    targetType: 'Investor',
    targetId: investorId,
    metadata: { bankName: input.bankName, last4: input.bankLast4 },
    ip,
  };
  const newMethod = `COALESCE(?, (SELECT method FROM banking_details WHERE investor_id = ?), 'ACH · monthly')`;

  return [
    hasBanking
      ? auditStmtIf(
          database,
          bankingAudit,
          `NOT EXISTS (SELECT 1 FROM banking_details WHERE investor_id = ? AND bank_name = ? AND last4 = ?
                       AND method = ${newMethod})`,
          [investorId, input.bankName, input.bankLast4, input.bankMethod ?? null, investorId],
          at,
        )
      : auditStmtIf(database, bankingAudit, 'EXISTS (SELECT 1 FROM banking_details WHERE investor_id = ?)', [investorId], at),
    auditStmt(database, { action: 'PROFILE_EDIT', actorUserId, targetType: 'Investor', targetId: investorId, ip }, at),
    database
      .prepare('UPDATE investors SET legal_name = ?, email = ?, type = ?, phone = ?, updated_at = ? WHERE id = ?')
      .bind(input.name, input.email, input.type, input.phone ?? null, at, investorId),
    // Keep the linked login's display name in sync (its email is managed via credentials).
    database
      .prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = (SELECT user_id FROM investors WHERE id = ?)')
      .bind(input.name, at, investorId),
    hasBanking
      ? database
          .prepare(
            `INSERT INTO banking_details (id, investor_id, bank_name, last4, method, updated_at)
             VALUES (?, ?, ?, ?, COALESCE(?, 'ACH · monthly'), ?)
             ON CONFLICT (investor_id) DO UPDATE SET
               bank_name = excluded.bank_name,
               last4 = excluded.last4,
               method = COALESCE(?, banking_details.method, 'ACH · monthly'),
               updated_at = excluded.updated_at`,
          )
          .bind(newId(), investorId, input.bankName, input.bankLast4, input.bankMethod ?? null, at, input.bankMethod ?? null)
      : database.prepare('DELETE FROM banking_details WHERE investor_id = ?').bind(investorId),
  ];
}

// ─── Own password ───────────────────────────────────────────────────────────

/** Investor changes their own password (from Profile; requires the current one). */
export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  ip: string | null,
  database: D1Database = db(),
) {
  const user = await findUserById(database, userId);
  if (!user) throw new HttpError(401, 'Not authenticated.');
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new HttpError(400, 'Current password is incorrect.');
  }
  const newHash = await hashPassword(newPassword);
  const at = Date.now();
  // Applies only if the password is still the one just verified.
  const [update] = await database.batch([
    database
      .prepare('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ? AND password_hash = ?')
      .bind(newHash, at, userId, user.passwordHash),
    auditStmtIf(
      database,
      { action: 'PASSWORD_CHANGE', actorUserId: userId, targetType: 'User', targetId: userId, ip },
      'changes() = 1',
      [],
      at,
    ),
  ]);
  if (!update?.meta.changes) throw new HttpError(409, 'Your password was changed elsewhere. Please sign in again.');
}

/**
 * Forced first-login password set. The authenticated session proves identity,
 * so no current password is required — but it only applies while the account
 * still has the management-issued password this request read (hash AND
 * mustChangePassword checked in the UPDATE), so an in-flight request cannot
 * overwrite credentials management reset in the meantime.
 */
export async function setInitialPassword(userId: string, newPassword: string, ip: string | null, database: D1Database = db()) {
  const user = await findUserById(database, userId);
  if (!user) throw new HttpError(401, 'Not authenticated.');
  if (!user.mustChangePassword) throw new HttpError(400, 'Password has already been set.');
  const newHash = await hashPassword(newPassword);
  const [update] = await database.batch(initialPasswordStatements(database, userId, user.passwordHash, newHash, ip));
  if (!update?.meta.changes) throw new HttpError(409, 'Your sign-in details changed. Please sign in again.');
}

export function initialPasswordStatements(
  database: D1Database,
  userId: string,
  issuedHash: string,
  newHash: string,
  ip: string | null,
  at = Date.now(),
): D1PreparedStatement[] {
  return [
    database
      .prepare(
        `UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ?
         WHERE id = ? AND must_change_password = 1 AND password_hash = ?`,
      )
      .bind(newHash, at, userId, issuedHash),
    auditStmtIf(
      database,
      { action: 'PASSWORD_CHANGE', actorUserId: userId, targetType: 'User', targetId: userId, metadata: { initial: true }, ip },
      'changes() = 1',
      [],
      at,
    ),
  ];
}

// ─── Notification preferences ───────────────────────────────────────────────

export async function setNotifPref(
  investorId: string,
  key: 'distributionPosted' | 'maturityReminder',
  value: boolean,
  actorUserId: string,
  ip: string | null,
  database: D1Database = db(),
) {
  const column = key === 'distributionPosted' ? 'distribution_posted' : 'maturity_reminder';
  const at = Date.now();
  await database.batch([
    database
      .prepare(
        `INSERT INTO notif_prefs (id, investor_id, ${column}, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (investor_id) DO UPDATE SET ${column} = excluded.${column}, updated_at = excluded.updated_at`,
      )
      .bind(newId(), investorId, value ? 1 : 0, at),
    auditStmt(
      database,
      { action: 'NOTIF_PREF_CHANGE', actorUserId, targetType: 'Investor', targetId: investorId, metadata: { key, value }, ip },
      at,
    ),
  ]);
}
