// Typed read queries over D1. Writes that change more than one row live in
// src/server/lifecycle.ts as atomic batches.

import {
  toBool,
  toDate,
  toDateOrNull,
  type D1Database,
} from './d1';
import type {
  BankingDetail,
  Distribution,
  Document,
  DocumentKind,
  Investor,
  InvestorState,
  InvestorType,
  Note,
  NoteStatus,
  NotifPref,
  Role,
  User,
} from '@/lib/domain';

type Row = Record<string, unknown>;
const str = (v: unknown): string => String(v);
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const num = (v: unknown): number => Number(v);

// ─── Mappers ────────────────────────────────────────────────────────────────

export function mapUser(r: Row): User {
  return {
    id: str(r.id),
    role: str(r.role) as Role,
    name: str(r.name),
    email: str(r.email),
    passwordHash: str(r.password_hash),
    phone: strOrNull(r.phone),
    failedLoginAttempts: num(r.failed_login_attempts),
    lockedUntil: toDateOrNull(r.locked_until),
    mustChangePassword: toBool(r.must_change_password),
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at),
  };
}

export function mapInvestor(r: Row, prefix = ''): Investor {
  const c = (k: string) => r[`${prefix}${k}`];
  return {
    id: str(c('id')),
    legalName: str(c('legal_name')),
    type: str(c('type')) as InvestorType,
    email: str(c('email')),
    phone: strOrNull(c('phone')),
    state: str(c('state')) as InvestorState,
    userId: strOrNull(c('user_id')),
    createdAt: toDate(c('created_at')),
    updatedAt: toDate(c('updated_at')),
  };
}

export function mapNote(r: Row, prefix = ''): Note {
  const c = (k: string) => r[`${prefix}${k}`];
  return {
    id: str(c('id')),
    investorId: str(c('investor_id')),
    principalCents: num(c('principal_cents')),
    rateBps: num(c('rate_bps')),
    termMonths: num(c('term_months')),
    monthlyAmountCents: num(c('monthly_amount_cents')),
    wireDate: toDateOrNull(c('wire_date')),
    firstDistributionDate: toDateOrNull(c('first_distribution_date')),
    maturityDate: toDateOrNull(c('maturity_date')),
    distributionDay: num(c('distribution_day')),
    status: str(c('status')) as NoteStatus,
    createdAt: toDate(c('created_at')),
    updatedAt: toDate(c('updated_at')),
  };
}

export function mapDistribution(r: Row): Distribution {
  return {
    id: str(r.id),
    noteId: str(r.note_id),
    index: num(r.idx),
    dueDate: toDate(r.due_date),
    amountCents: num(r.amount_cents),
    paidDate: toDateOrNull(r.paid_date),
    reference: strOrNull(r.reference),
  };
}

// ─── Users & sessions ─────────────────────────────────────────────────────

export async function findUserByEmail(database: D1Database, email: string): Promise<User | null> {
  const r = await database.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<Row>();
  return r ? mapUser(r) : null;
}

export async function findUserById(database: D1Database, id: string): Promise<User | null> {
  const r = await database.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<Row>();
  return r ? mapUser(r) : null;
}

export interface SessionWithUser {
  sessionId: string;
  expiresAt: Date;
  user: User;
  investorId: string | null;
}

export async function findSessionByTokenHash(database: D1Database, tokenHash: string): Promise<SessionWithUser | null> {
  const r = await database
    .prepare(
      `SELECT s.id AS session_id, s.expires_at AS session_expires_at, u.*, i.id AS investor_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN investors i ON i.user_id = u.id
       WHERE s.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<Row>();
  if (!r) return null;
  return {
    sessionId: str(r.session_id),
    expiresAt: toDate(r.session_expires_at),
    user: mapUser(r),
    investorId: strOrNull(r.investor_id),
  };
}

export async function investorIdForUser(database: D1Database, userId: string): Promise<string | null> {
  const r = await database.prepare('SELECT id FROM investors WHERE user_id = ?').bind(userId).first<Row>();
  return r ? str(r.id) : null;
}

// ─── Investors, notes, schedule ───────────────────────────────────────────

export async function getInvestor(database: D1Database, id: string): Promise<Investor | null> {
  const r = await database.prepare('SELECT * FROM investors WHERE id = ?').bind(id).first<Row>();
  return r ? mapInvestor(r) : null;
}

export async function investorExists(database: D1Database, id: string): Promise<boolean> {
  return !!(await database.prepare('SELECT 1 AS ok FROM investors WHERE id = ?').bind(id).first<Row>());
}

export async function getNoteWithDistributions(
  database: D1Database,
  investorId: string,
): Promise<(Note & { distributions: Distribution[] }) | null> {
  const [noteRes, distRes] = await database.batch<Row>([
    database.prepare('SELECT * FROM notes WHERE investor_id = ?').bind(investorId),
    database
      .prepare(
        `SELECT d.* FROM distributions d JOIN notes n ON n.id = d.note_id
         WHERE n.investor_id = ? ORDER BY d.idx ASC`,
      )
      .bind(investorId),
  ]);
  const noteRow = noteRes?.results[0];
  if (!noteRow) return null;
  return { ...mapNote(noteRow), distributions: (distRes?.results ?? []).map(mapDistribution) };
}

export interface ActiveNoteSummary {
  note: Note;
  investorId: string;
  investorName: string;
  paidCents: number;
}

/** Active notes with their investor and total paid out (team overview). */
export async function listActiveNotes(database: D1Database): Promise<ActiveNoteSummary[]> {
  const { results } = await database
    .prepare(
      `SELECT n.*, i.id AS inv_id, i.legal_name AS inv_name,
              (SELECT COALESCE(SUM(d.amount_cents), 0) FROM distributions d
                WHERE d.note_id = n.id AND d.paid_date IS NOT NULL) AS paid_cents
       FROM notes n JOIN investors i ON i.id = n.investor_id
       WHERE n.status = 'ACTIVE'`,
    )
    .all<Row>();
  return results.map((r) => ({
    note: mapNote(r),
    investorId: str(r.inv_id),
    investorName: str(r.inv_name),
    paidCents: num(r.paid_cents),
  }));
}

export interface RosterRow {
  investor: Investor;
  note: Note | null;
  banking: BankingDetail | null;
  hasLogin: boolean;
}

export async function listRoster(database: D1Database): Promise<RosterRow[]> {
  const { results } = await database
    .prepare(
      `SELECT i.id AS i_id, i.legal_name AS i_legal_name, i.type AS i_type, i.email AS i_email,
              i.phone AS i_phone, i.state AS i_state, i.user_id AS i_user_id,
              i.created_at AS i_created_at, i.updated_at AS i_updated_at,
              n.id AS n_id, n.investor_id AS n_investor_id, n.principal_cents AS n_principal_cents,
              n.rate_bps AS n_rate_bps, n.term_months AS n_term_months,
              n.monthly_amount_cents AS n_monthly_amount_cents, n.wire_date AS n_wire_date,
              n.first_distribution_date AS n_first_distribution_date, n.maturity_date AS n_maturity_date,
              n.distribution_day AS n_distribution_day, n.status AS n_status,
              n.created_at AS n_created_at, n.updated_at AS n_updated_at,
              b.bank_name AS b_bank_name, b.last4 AS b_last4, b.method AS b_method
       FROM investors i
       LEFT JOIN notes n ON n.investor_id = i.id
       LEFT JOIN banking_details b ON b.investor_id = i.id
       ORDER BY i.created_at ASC, i.rowid ASC`,
    )
    .all<Row>();
  return results.map((r) => ({
    investor: mapInvestor(r, 'i_'),
    note: r.n_id ? mapNote(r, 'n_') : null,
    banking: r.b_bank_name
      ? { investorId: str(r.i_id), bankName: str(r.b_bank_name), last4: str(r.b_last4), method: str(r.b_method) }
      : null,
    hasLogin: !!r.i_user_id,
  }));
}

export interface InvestorProfileData {
  investor: Investor;
  banking: BankingDetail | null;
  notifPref: NotifPref | null;
}

export async function getInvestorProfile(database: D1Database, investorId: string): Promise<InvestorProfileData | null> {
  const r = await database
    .prepare(
      `SELECT i.*, b.bank_name AS b_bank_name, b.last4 AS b_last4, b.method AS b_method,
              p.distribution_posted AS p_distribution_posted, p.maturity_reminder AS p_maturity_reminder,
              p.id AS p_id
       FROM investors i
       LEFT JOIN banking_details b ON b.investor_id = i.id
       LEFT JOIN notif_prefs p ON p.investor_id = i.id
       WHERE i.id = ?`,
    )
    .bind(investorId)
    .first<Row>();
  if (!r) return null;
  return {
    investor: mapInvestor(r),
    banking: r.b_bank_name
      ? { investorId, bankName: str(r.b_bank_name), last4: str(r.b_last4), method: str(r.b_method) }
      : null,
    notifPref: r.p_id
      ? { investorId, distributionPosted: toBool(r.p_distribution_posted), maturityReminder: toBool(r.p_maturity_reminder) }
      : null,
  };
}

// ─── Documents ────────────────────────────────────────────────────────────

const mapDocument = (r: Row): Document => ({
  id: str(r.id),
  investorId: str(r.investor_id),
  name: str(r.name),
  kind: str(r.kind) as DocumentKind,
  issuedDate: toDate(r.issued_date),
  storageKey: str(r.storage_key),
});

export async function listDocuments(database: D1Database, investorId: string): Promise<Document[]> {
  const { results } = await database
    .prepare('SELECT * FROM documents WHERE investor_id = ? ORDER BY issued_date DESC, rowid DESC')
    .bind(investorId)
    .all<Row>();
  return results.map(mapDocument);
}

export interface DocumentForDownload {
  document: Document;
  investorName: string;
  note: Pick<Note, 'principalCents' | 'rateBps' | 'termMonths'> | null;
}

export async function getDocumentForDownload(database: D1Database, id: string): Promise<DocumentForDownload | null> {
  const r = await database
    .prepare(
      `SELECT d.*, i.legal_name AS inv_name,
              n.principal_cents AS n_principal_cents, n.rate_bps AS n_rate_bps, n.term_months AS n_term_months
       FROM documents d
       JOIN investors i ON i.id = d.investor_id
       LEFT JOIN notes n ON n.investor_id = d.investor_id
       WHERE d.id = ?`,
    )
    .bind(id)
    .first<Row>();
  if (!r) return null;
  return {
    document: mapDocument(r),
    investorName: str(r.inv_name),
    note:
      r.n_principal_cents === null || r.n_principal_cents === undefined
        ? null
        : { principalCents: num(r.n_principal_cents), rateBps: num(r.n_rate_bps), termMonths: num(r.n_term_months) },
  };
}
