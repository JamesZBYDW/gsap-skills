// Integration tests for every management write against a real local D1:
// atomicity, rollback, concurrency and audit behaviour.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { freshD1 } from './support/d1';
import type { D1Database } from '@/server/db/d1';
import {
  createInvestorAccount,
  credentialStatements,
  initialPasswordStatements,
  noteTermsStatements,
  planNoteTerms,
  provisionCredentials,
  setInitialPassword,
  setNoteTerms,
  updateInvestorProfile,
  profileStatements,
} from '@/server/lifecycle';
import { getNoteWithDistributions } from '@/server/db/repo';
import { verifyPassword } from '@/lib/password-core';
import { HttpError } from '@/lib/http';
import { createAccountSchema, investorProfileSchema, noteTermsSchema } from '@/lib/validation';

let db: D1Database;
let dispose: () => Promise<void>;
const ACTOR = 'team-actor';

beforeAll(async () => {
  ({ db, dispose } = await freshD1());
  const now = Date.now();
  await db
    .prepare(`INSERT INTO users (id, role, name, email, password_hash, created_at, updated_at) VALUES (?, 'TEAM', 'Team', 'team@test.example', 'x', ?, ?)`)
    .bind(ACTOR, now, now)
    .run();
});
afterAll(async () => dispose?.());

const count = async (sql: string, ...params: unknown[]) =>
  Number((await db.prepare(sql).bind(...params).first<{ n: number }>())!.n);
const tableCounts = async () => ({
  investors: await count('SELECT count(*) AS n FROM investors'),
  notes: await count('SELECT count(*) AS n FROM notes'),
  distributions: await count('SELECT count(*) AS n FROM distributions'),
  users: await count('SELECT count(*) AS n FROM users'),
  audit: await count('SELECT count(*) AS n FROM audit_logs'),
});

let seq = 0;
const account = (over: Record<string, unknown> = {}) =>
  createAccountSchema.parse({
    name: `Investor ${++seq}`,
    email: `inv${seq}@test.example`,
    type: 'ENTITY',
    phone: '(646) 555-0107',
    password: 'Harbor2026xyz',
    principal: '600,000',
    ratePercent: '15',
    termMonths: '24',
    wireReceivedDate: '2026-09-01',
    ...over,
  });
const terms = (over: Record<string, unknown> = {}) =>
  noteTermsSchema.parse({ principal: '750,000', ratePercent: '15', termMonths: '18', wireReceivedDate: '2026-08-01', ...over });

async function snapshot(investorId: string) {
  const note = await getNoteWithDistributions(db, investorId);
  return JSON.parse(JSON.stringify(note));
}

const expectHttp = async (p: Promise<unknown>, status: number) => {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(HttpError);
  expect((err as HttpError).status).toBe(status);
};

// ─── Account creation ─────────────────────────────────────────────────────

describe('createInvestorAccount (one batch)', () => {
  it('writes investor, note, full 36-month schedule, login and audits together', async () => {
    const input = account({ termMonths: '36', principal: '1,000,000', ratePercent: '18' });
    const { id } = await createInvestorAccount(input, ACTOR, '203.0.113.7', db);

    const inv = await db.prepare('SELECT * FROM investors WHERE id = ?').bind(id).first<Record<string, unknown>>();
    expect(inv?.state).toBe('ACTIVE');
    expect(inv?.user_id).toBeTruthy();

    const note = await getNoteWithDistributions(db, id);
    const plan = planNoteTerms(input);
    expect(note?.principalCents).toBe(100_000_000);
    expect(note?.monthlyAmountCents).toBe(1_500_000); // $1M × 18% ÷ 12, integer cents
    expect(note?.distributions).toHaveLength(plan.planned.length);
    expect(plan.planned.length).toBeGreaterThanOrEqual(36);
    const last = note!.distributions.at(-1)!;
    expect(last.amountCents).toBe(1_500_000 + 100_000_000); // final one returns principal
    expect(note!.distributions.every((d) => Number.isInteger(d.amountCents))).toBe(true);

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(inv!.user_id).first<Record<string, unknown>>();
    expect(user?.email).toBe(input.email);
    expect(user?.must_change_password).toBe(1);
    expect(await verifyPassword(String(user!.password_hash), 'Harbor2026xyz')).toBe(true);

    const actions = (
      await db.prepare('SELECT action, ip FROM audit_logs WHERE target_id = ? ORDER BY action').bind(id).all<{ action: string; ip: string }>()
    ).results;
    expect(actions.map((a) => a.action)).toEqual(['CREDENTIALS_SET', 'INVESTOR_CREATE', 'INVESTOR_STATE_CHANGE', 'NOTE_TERMS_SET']);
    expect(actions.every((a) => a.ip === '203.0.113.7')).toBe(true);
  });

  it('rejects a taken login email with 409 and writes nothing', async () => {
    const first = account();
    await createInvestorAccount(first, ACTOR, null, db);
    const before = await tableCounts();
    await expectHttp(createInvestorAccount(account({ loginEmail: first.email }), ACTOR, null, db), 409);
    expect(await tableCounts()).toEqual(before);
  });

  it('a concurrent duplicate-email race yields one account, one 409 and no orphan rows', async () => {
    const before = await tableCounts();
    const email = `race${Date.now()}@test.example`;
    const results = await Promise.allSettled([
      createInvestorAccount(account({ loginEmail: email }), ACTOR, null, db),
      createInvestorAccount(account({ loginEmail: email }), ACTOR, null, db),
      createInvestorAccount(account({ loginEmail: email }), ACTOR, null, db),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(2);
    for (const f of failed) expect((f.reason as HttpError).status).toBe(409);

    const after = await tableCounts();
    const winner = (ok[0] as PromiseFulfilledResult<{ id: string }>).value.id;
    const winnerDistributions = await count(
      'SELECT count(*) AS n FROM distributions d JOIN notes n ON n.id = d.note_id WHERE n.investor_id = ?',
      winner,
    );
    expect(after.investors - before.investors).toBe(1);
    expect(after.notes - before.notes).toBe(1);
    expect(after.users - before.users).toBe(1);
    expect(after.distributions - before.distributions).toBe(winnerDistributions);
    expect(after.audit - before.audit).toBe(4);
    expect(await count('SELECT count(*) AS n FROM users u WHERE u.role = ? AND NOT EXISTS (SELECT 1 FROM investors i WHERE i.user_id = u.id)', 'INVESTOR')).toBe(0);
  });
});

// ─── Note terms ───────────────────────────────────────────────────────────

describe('setNoteTerms (one batch)', () => {
  it('rolls back completely when a schedule insert fails after the delete', async () => {
    const { id } = await createInvestorAccount(account(), ACTOR, null, db);
    const before = await snapshot(id);
    const auditBefore = await count('SELECT count(*) AS n FROM audit_logs');
    expect(before.distributions.length).toBeGreaterThan(0);

    const plan = planNoteTerms(terms({ termMonths: '36', principal: '900,000' }));
    // Duplicate an index: the UNIQUE(note_id, idx) violation happens on an
    // INSERT that runs after the DELETE of the old schedule.
    plan.planned.push({ ...plan.planned[0]! });
    const statements = noteTermsStatements(db, id, plan, ACTOR, null);
    await expect(db.batch(statements)).rejects.toThrow(/UNIQUE/);

    expect(await snapshot(id)).toEqual(before); // original terms + schedule intact
    expect(await count('SELECT count(*) AS n FROM audit_logs')).toBe(auditBefore); // no audit either
    const inv = await db.prepare('SELECT state FROM investors WHERE id = ?').bind(id).first<{ state: string }>();
    expect(inv?.state).toBe('ACTIVE');
  });

  it('concurrent saves never mix one request\'s terms with another\'s schedule', async () => {
    const { id } = await createInvestorAccount(account(), ACTOR, null, db);
    const a = terms({ termMonths: '12', principal: '500,000', ratePercent: '12', wireReceivedDate: '2026-01-15' });
    const b = terms({ termMonths: '36', principal: '1,000,000', ratePercent: '18', wireReceivedDate: '2026-03-01' });
    for (let round = 0; round < 3; round++) {
      await Promise.all([setNoteTerms(id, a, ACTOR, null, db), setNoteTerms(id, b, ACTOR, null, db), setNoteTerms(id, a, ACTOR, null, db)]);
      const note = (await getNoteWithDistributions(db, id))!;
      const plan = planNoteTerms(note.termMonths === 12 ? a : b);
      expect(note.monthlyAmountCents).toBe(plan.amountCents);
      expect(note.distributions.map((d) => [d.index, d.dueDate.getTime(), d.amountCents])).toEqual(
        plan.planned.map((d) => [d.index, d.dueDate.getTime(), d.amountCents]),
      );
    }
  });

  it('returns 404 for an unknown investor without writing', async () => {
    const before = await tableCounts();
    await expectHttp(setNoteTerms('no-such-investor', terms(), ACTOR, null, db), 404);
    expect(await tableCounts()).toEqual(before);
  });
});

// ─── Credentials ─────────────────────────────────────────────────────────

async function bareInvestor(): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db
    .prepare(`INSERT INTO investors (id, legal_name, type, email, state, created_at, updated_at) VALUES (?, 'Bare Co', 'ENTITY', ?, 'AWAITING', ?, ?)`)
    .bind(id, `bare${id.slice(0, 8)}@test.example`, now, now)
    .run();
  return id;
}

describe('provisionCredentials (one batch)', () => {
  it('concurrent first-time logins produce exactly one linked user and no orphans', async () => {
    const id = await bareInvestor();
    const before = await count("SELECT count(*) AS n FROM users WHERE role = 'INVESTOR'");
    const e1 = `one${id.slice(0, 6)}@test.example`;
    const e2 = `two${id.slice(0, 6)}@test.example`;
    await Promise.all([
      provisionCredentials(id, { email: e1, password: 'FirstPass2026a', mustChange: true }, ACTOR, null, db),
      provisionCredentials(id, { email: e2, password: 'SecondPass2026b', mustChange: false }, ACTOR, null, db),
    ]);
    expect(await count("SELECT count(*) AS n FROM users WHERE role = 'INVESTOR'")).toBe(before + 1);
    const u = await db
      .prepare('SELECT u.* FROM users u JOIN investors i ON i.user_id = u.id WHERE i.id = ?')
      .bind(id)
      .first<Record<string, unknown>>();
    // Whichever request committed last, its email, password and flag all match.
    const pw = u!.email === e1 ? 'FirstPass2026a' : 'SecondPass2026b';
    expect([e1, e2]).toContain(u!.email);
    expect(await verifyPassword(String(u!.password_hash), pw)).toBe(true);
    expect(u!.must_change_password).toBe(u!.email === e1 ? 1 : 0);
  });

  it('refuses an email used by another login (409) and changes nothing', async () => {
    const { id } = await createInvestorAccount(account(), ACTOR, null, db);
    const userBefore = await db.prepare('SELECT u.* FROM users u JOIN investors i ON i.user_id = u.id WHERE i.id = ?').bind(id).first();
    await expectHttp(provisionCredentials(id, { email: 'team@test.example', password: 'Whatever2026x' }, ACTOR, null, db), 409);
    const userAfter = await db.prepare('SELECT u.* FROM users u JOIN investors i ON i.user_id = u.id WHERE i.id = ?').bind(id).first();
    expect(userAfter).toEqual(userBefore);
  });

  it('the UNIQUE constraint alone also rolls back the whole credential batch', async () => {
    const { id } = await createInvestorAccount(account(), ACTOR, null, db);
    const userBefore = await db.prepare('SELECT u.* FROM users u JOIN investors i ON i.user_id = u.id WHERE i.id = ?').bind(id).first();
    const auditBefore = await count('SELECT count(*) AS n FROM audit_logs');
    // Bypass the friendly pre-check to exercise the constraint path directly.
    await expect(
      db.batch(credentialStatements(db, id, { loginEmail: 'team@test.example', passwordHash: 'h', mustChange: false }, ACTOR, null)),
    ).rejects.toThrow(/UNIQUE/);
    expect(await db.prepare('SELECT u.* FROM users u JOIN investors i ON i.user_id = u.id WHERE i.id = ?').bind(id).first()).toEqual(userBefore);
    expect(await count('SELECT count(*) AS n FROM audit_logs')).toBe(auditBefore);
  });
});

// ─── Profile + banking ───────────────────────────────────────────────────

describe('updateInvestorProfile (one batch)', () => {
  const profile = (over: Record<string, unknown> = {}) =>
    investorProfileSchema.parse({ name: 'Crest Harbor Holdings', email: 'admin@crest.example', type: 'ENTITY', phone: '(917) 555-0142', ...over });
  const banking = (id: string) => count("SELECT count(*) AS n FROM audit_logs WHERE target_id = ? AND action = 'BANKING_EDIT'", id);

  it('audits banking only when it actually changes', async () => {
    const { id } = await createInvestorAccount(account(), ACTOR, null, db);
    await updateInvestorProfile(id, profile({ bankName: 'Chase', bankLast4: '6042' }), ACTOR, null, db);
    expect(await banking(id)).toBe(1);
    await updateInvestorProfile(id, profile({ bankName: 'Chase', bankLast4: '6042' }), ACTOR, null, db);
    expect(await banking(id)).toBe(1); // unchanged → no new BANKING_EDIT
    await updateInvestorProfile(id, profile({ bankName: 'Chase', bankLast4: '7777' }), ACTOR, null, db);
    expect(await banking(id)).toBe(2);
    await updateInvestorProfile(id, profile(), ACTOR, null, db); // banking removed
    expect(await banking(id)).toBe(3);
    expect(await count('SELECT count(*) AS n FROM banking_details WHERE investor_id = ?', id)).toBe(0);
    expect(await count("SELECT count(*) AS n FROM audit_logs WHERE target_id = ? AND action = 'PROFILE_EDIT'", id)).toBe(4);
    const u = await db.prepare('SELECT u.name FROM users u JOIN investors i ON i.user_id = u.id WHERE i.id = ?').bind(id).first<{ name: string }>();
    expect(u?.name).toBe('Crest Harbor Holdings'); // login display name kept in sync
  });

  it('a failing banking write rolls back the identity change and both audits', async () => {
    const { id } = await createInvestorAccount(account({ name: 'Original Name' }), ACTOR, null, db);
    const auditBefore = await count('SELECT count(*) AS n FROM audit_logs');
    // Bypass validation: last4 violates the CHECK constraint on the final statement.
    const bad = { ...profile({ name: 'Changed Name' }), bankName: 'Chase', bankLast4: '12a4' };
    await expect(db.batch(profileStatements(db, id, bad, ACTOR, null))).rejects.toThrow(/CHECK/);
    const inv = await db.prepare('SELECT legal_name FROM investors WHERE id = ?').bind(id).first<{ legal_name: string }>();
    expect(inv?.legal_name).toBe('Original Name');
    expect(await count('SELECT count(*) AS n FROM audit_logs')).toBe(auditBefore);
  });
});

// ─── Passwords ──────────────────────────────────────────────────────────

describe('setInitialPassword', () => {
  it('only one of two concurrent first-password submissions can win', async () => {
    const { id } = await createInvestorAccount(account(), ACTOR, null, db);
    const userId = String((await db.prepare('SELECT user_id FROM investors WHERE id = ?').bind(id).first<{ user_id: string }>())!.user_id);
    const results = await Promise.allSettled([
      setInitialPassword(userId, 'Aurora2026zzz', null, db),
      setInitialPassword(userId, 'Borealis2026yy', null, db),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await count("SELECT count(*) AS n FROM audit_logs WHERE target_id = ? AND action = 'PASSWORD_CHANGE'", userId)).toBe(1);
    const u = await db.prepare('SELECT password_hash, must_change_password FROM users WHERE id = ?').bind(userId).first<Record<string, unknown>>();
    expect(u?.must_change_password).toBe(0);
    const hash = String(u!.password_hash);
    expect((await verifyPassword(hash, 'Aurora2026zzz')) !== (await verifyPassword(hash, 'Borealis2026yy'))).toBe(true);
  });
});

// ─── Audit trail ────────────────────────────────────────────────────────

describe('audit_logs', () => {
  it('is append-only', async () => {
    await expect(db.prepare("UPDATE audit_logs SET action = 'X'").run()).rejects.toThrow(/append-only/);
    await expect(db.prepare('DELETE FROM audit_logs').run()).rejects.toThrow(/append-only/);
  });
});

// ─── Credential races and session revocation (review regressions) ─────────

describe('credential changes and sessions', () => {
  const linkedUser = async (investorId: string) =>
    (await db.prepare('SELECT u.* FROM users u JOIN investors i ON i.user_id = u.id WHERE i.id = ?').bind(investorId).first<Record<string, unknown>>())!;
  const addSession = (userId: string) =>
    db
      .prepare('INSERT INTO sessions (id, token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), crypto.randomUUID(), userId, Date.now() + 3_600_000, Date.now())
      .run();

  it('an in-flight first-password set cannot overwrite credentials management just reset', async () => {
    const { id } = await createInvestorAccount(account(), ACTOR, null, db);
    const issued = await linkedUser(id); // what the investor's request read
    await provisionCredentials(id, { password: 'Reissued2026pw', mustChange: true }, ACTOR, null, db); // reset lands
    const [update] = await db.batch(
      initialPasswordStatements(db, String(issued.id), String(issued.password_hash), 'scrypt$stale', null),
    );
    expect(update?.meta.changes).toBe(0);
    const after = await linkedUser(id);
    expect(await verifyPassword(String(after.password_hash), 'Reissued2026pw')).toBe(true);
    expect(after.must_change_password).toBe(1);
    expect(await count("SELECT count(*) AS n FROM audit_logs WHERE target_id = ? AND action = 'PASSWORD_CHANGE'", issued.id)).toBe(0);
  });

  it('a credential reset revokes every existing session of that login, atomically', async () => {
    const { id } = await createInvestorAccount(account(), ACTOR, null, db);
    const u = await linkedUser(id);
    await addSession(String(u.id));
    await addSession(String(u.id));
    await provisionCredentials(id, { password: 'Reset2026passwd', mustChange: false }, ACTOR, null, db);
    expect(await count('SELECT count(*) AS n FROM sessions WHERE user_id = ?', u.id)).toBe(0);
  });

  it('a failed (rolled-back) credential reset keeps the sessions', async () => {
    const { id } = await createInvestorAccount(account(), ACTOR, null, db);
    const u = await linkedUser(id);
    await addSession(String(u.id));
    await expect(
      db.batch(credentialStatements(db, id, { loginEmail: 'team@test.example', passwordHash: 'h', mustChange: false }, ACTOR, null)),
    ).rejects.toThrow(/UNIQUE/);
    expect(await count('SELECT count(*) AS n FROM sessions WHERE user_id = ?', u.id)).toBe(1);
  });
});
