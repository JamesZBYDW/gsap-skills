import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { freshD1 } from './support/d1';
import type { D1Database } from '@/server/db/d1';
import { accountEmailStatement, DAY, maturityEmailStatement, passwordEmailToken, paymentEmailStatement, utcToday } from '@/server/email/outbox';
import { runPortalEmail, type PortalEmailEnv } from '@/server/email/dispatch';

let db: D1Database;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await freshD1()));
afterAll(async () => dispose?.());
const now = Date.UTC(2026, 10, 10, 12);
const secret = 'test-only-email-secret-0123456789abcdef';
const send = () => vi.fn<NonNullable<PortalEmailEnv['ACG_EMAIL']>['send']>().mockResolvedValue({ messageId: 'test-provider-receipt' });
const env = (transport: ReturnType<typeof send>): PortalEmailEnv => ({
  DB: db, ACG_EMAIL: { send: transport }, EMAIL_FROM: 'sender@acg.example', EMAIL_LINK_SECRET: secret, APP_URL: 'https://portal.acg.example',
});
const readJob = (id: string) => db.prepare('SELECT * FROM email_outbox WHERE id = ?').bind(id).first();

async function investor(maturityDate = utcToday(now) + DAY * 365) {
  const id = randomUUID();
  const email = `${id}@example.invalid`;
  await db.batch([
    db.prepare("INSERT INTO users (id,role,name,email,password_hash,created_at,updated_at) VALUES (?,'INVESTOR','Investor',?,'fixture',?,?)").bind(id, email, now, now),
    db.prepare("INSERT INTO investors (id,legal_name,type,email,state,user_id,created_at,updated_at) VALUES (?,'Investor','INDIVIDUAL',?,'ACTIVE',?,?,?)").bind(id, email, id, now, now),
    db.prepare("INSERT INTO notes (id,investor_id,principal_cents,rate_bps,term_months,monthly_amount_cents,maturity_date,status,created_at,updated_at) VALUES (?,?,10000000,1200,12,100000,?,'ACTIVE',?,?)").bind(id, id, maturityDate, now, now),
  ]);
  return { id, email };
}

async function accountMessage(kind: 'reset' | 'invite' = 'reset') {
  const { id: userId, email } = await investor();
  const resetId = randomUUID();
  const token = passwordEmailToken(resetId, secret);
  await db.batch([
    db.prepare('INSERT INTO password_resets (id,token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?,?)').bind(resetId, createHash('sha256').update(token).digest('hex'), userId, now + DAY, now),
    accountEmailStatement(db, kind, resetId, now),
  ]);
  return { id: `${kind}:${resetId}`, resetId, token, userId, email };
}

describe('transactional portal email with local D1 and simulated provider', () => {
  it('sends one private invitation across two competing workers and records acceptance', async () => {
    const job = await accountMessage('invite');
    await accountEmailStatement(db, 'invite', job.resetId, now).run();
    expect(JSON.stringify(await readJob(job.id))).not.toContain(job.token);
    const transport = send();
    await Promise.all([runPortalEmail(env(transport), () => now), runPortalEmail(env(transport), () => now)]);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]![0]).toMatchObject({ to: job.email, subject: expect.stringMatching(/invitation/), text: expect.stringContaining(`https://portal.acg.example/set-password#token=${job.token}`), html: expect.stringContaining(`href="https://portal.acg.example/set-password#token=${job.token}"`) });
    expect(await readJob(job.id)).toMatchObject({ state: 'accepted', attempts: 1, provider_id: 'test-provider-receipt' });
  });

  it('suppresses consumed, expired or misaddressed password links', async () => {
    const a = await accountMessage();
    const b = await accountMessage();
    const c = await accountMessage();
    await db.batch([
      db.prepare('UPDATE password_resets SET used_at=? WHERE id=?').bind(now, a.resetId),
      db.prepare('UPDATE password_resets SET expires_at=? WHERE id=?').bind(now, b.resetId),
      db.prepare('UPDATE users SET email=? WHERE id=?').bind('changed@example.invalid', c.userId),
    ]);
    const transport = send();
    await runPortalEmail(env(transport), () => now);
    expect(transport).not.toHaveBeenCalled();
    for (const job of [a, b, c]) expect(await readJob(job.id)).toMatchObject({ state: 'skipped' });
  });

  it('checks a payment audit, then rechecks preferences when the sender claims the job', async () => {
    const { id } = await investor();
    const dist = randomUUID();
    const auditId = randomUUID();
    await db.prepare('INSERT INTO distributions (id,note_id,idx,due_date,amount_cents,paid_date) VALUES (?,?,1,?,100000,?)').bind(dist, id, now, now).run();
    await paymentEmailStatement(db, dist, auditId, now).run();
    expect(await readJob(`payment:${dist}`)).toBeNull();
    await db.batch([
      db.prepare("INSERT INTO audit_logs (id,action,target_type,target_id,created_at) VALUES (?,'DISTRIBUTION_PAID','Distribution',?,?)").bind(auditId, dist, now),
      paymentEmailStatement(db, dist, auditId, now),
      db.prepare('INSERT INTO notif_prefs (id,investor_id,distribution_posted,updated_at) VALUES (?,?,0,?)').bind(randomUUID(), id, now),
    ]);
    const transport = send();
    await runPortalEmail(env(transport), () => now);
    expect(transport).not.toHaveBeenCalled();
    expect(await readJob(`payment:${dist}`)).toMatchObject({ state: 'skipped' });
    const next = randomUUID();
    const nextAudit = randomUUID();
    await db.batch([
      db.prepare('UPDATE notif_prefs SET distribution_posted = 1 WHERE investor_id = ?').bind(id),
      db.prepare('INSERT INTO distributions (id,note_id,idx,due_date,amount_cents,paid_date) VALUES (?,?,2,?,100000,?)').bind(next, id, now, now),
      db.prepare("INSERT INTO audit_logs (id,action,target_type,target_id,created_at) VALUES (?,'DISTRIBUTION_PAID','Distribution',?,?)").bind(nextAudit, next, now),
      paymentEmailStatement(db, next, nextAudit, now),
      paymentEmailStatement(db, next, nextAudit, now),
    ]);
    await runPortalEmail(env(transport), () => now);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]![0].subject).toMatch(/Distribution recorded/);
    expect(await readJob(`payment:${next}`)).toMatchObject({ state: 'accepted' });
  });

  it('sends a maturity reminder once per note and maturity date, honoring opt-out and changed terms', async () => {
    const due = utcToday(now) + DAY * 90;
    const active = await investor(due);
    const optedOut = await investor(due);
    const changed = await investor(due);
    await db.prepare('INSERT INTO notif_prefs (id,investor_id,maturity_reminder,updated_at) VALUES (?,?,0,?)').bind(randomUUID(), optedOut.id, now).run();
    await maturityEmailStatement(db, now).run();
    await db.prepare('UPDATE notes SET maturity_date = ? WHERE id = ?').bind(due + DAY * 40, changed.id).run();
    const transport = send();
    await runPortalEmail(env(transport), () => now);
    await runPortalEmail(env(transport), () => now);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]![0]).toMatchObject({ to: active.email, subject: expect.stringMatching(/maturity/) });
    expect(await readJob(`maturity:${optedOut.id}:${due}`)).toBeNull();
    expect(await readJob(`maturity:${changed.id}:${due}`)).toMatchObject({ state: 'skipped' });
  });

  it('retries an explicit rate-limit rejection after backoff and holds ambiguous sends', async () => {
    const a = await accountMessage();
    const transport = send().mockRejectedValueOnce(Object.assign(new Error('test'), { code: 'E_RATE_LIMIT_EXCEEDED' }));
    await runPortalEmail(env(transport), () => now);
    const queued = await readJob(a.id);
    expect(queued).toMatchObject({ state: 'pending', attempts: 1 });
    await runPortalEmail(env(transport), () => now + 1);
    expect(transport).toHaveBeenCalledTimes(1);
    await runPortalEmail(env(transport), () => Number(queued?.available_at));
    expect(await readJob(a.id)).toMatchObject({ state: 'accepted', attempts: 2 });
    const b = await accountMessage();
    transport.mockRejectedValueOnce(new Error('Connection reset after handoff'));
    await runPortalEmail(env(transport), () => now);
    await runPortalEmail(env(transport), () => now + DAY);
    expect(await readJob(b.id)).toMatchObject({ state: 'uncertain', attempts: 1, result_code: 'provider_ack_unknown' });
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('does not resend when storing a provider acceptance fails', async () => {
    const job = await accountMessage();
    const transport = send();
    await db.prepare("CREATE TRIGGER email_test_failure BEFORE INSERT ON audit_logs WHEN NEW.action='EMAIL_DISPATCH' BEGIN SELECT RAISE(ABORT,'fixture'); END").run();
    try { await expect(runPortalEmail(env(transport), () => now)).rejects.toThrow(); }
    finally { await db.prepare('DROP TRIGGER email_test_failure').run(); }
    expect(await readJob(job.id)).toMatchObject({ state: 'sending' });
    await runPortalEmail(env(transport), () => now + 21 * 60_000);
    expect(await readJob(job.id)).toMatchObject({ state: 'uncertain', result_code: 'interrupted_dispatch' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
