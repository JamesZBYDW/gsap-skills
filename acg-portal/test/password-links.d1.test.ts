import { afterAll, beforeAll, expect, it } from 'vitest';
import { freshD1 } from './support/d1';
import type { D1Database } from '@/server/db/d1';
import { passwordLinkStatements, redeemPasswordLink } from '@/server/email/password-links';
import { passwordEmailToken } from '@/server/email/outbox';
import { attemptLogin } from '@/lib/auth';

const fixtureSecret = 'Test-only-link-signing-secret-private-to-the-local-suite';
const issue = async (email: string) => {
  await db.batch(passwordLinkStatements(db, email, 'reset', fixtureSecret, Date.now()));
  const row = await db
    .prepare('SELECT source_id FROM email_outbox WHERE recipient=? ORDER BY rowid DESC LIMIT 1')
    .bind(email)
    .first<{ source_id: string }>();
  return passwordEmailToken(row!.source_id, fixtureSecret);
};
let db: D1Database;
let dispose: () => Promise<void>;
beforeAll(async () => {
  ({ db, dispose } = await freshD1());
  for (const name of ['redeem', 'invalidate', 'expire']) {
    await db
      .prepare(
        "INSERT INTO users(id,role,name,email,password_hash,created_at,updated_at) VALUES(?,'TEAM',?,?, 'old',1,1)",
      )
      .bind(name, name, name + '@example.invalid')
      .run();
  }
}, 120000);
afterAll(async () => dispose?.());
it('redeems once under concurrency, ends old sessions, retains enrolled MFA and invalidates sibling links', async () => {
  const email = 'redeem@example.invalid';
  await db.prepare("INSERT INTO mfa_factors(user_id, secret_ciphertext, created_at, enabled_at) VALUES('redeem','test-factor',1,2)").run();
  const old = await issue(email);
  const token = await issue(email);
  await db
    .prepare(
      "INSERT INTO sessions(id,token_hash,user_id,expires_at,created_at) VALUES('s','opaque','redeem',9999999999999,1)",
    )
    .run();
  const res = await Promise.allSettled([
    redeemPasswordLink(db, token, 'NewSecure8', null),
    redeemPasswordLink(db, token, 'NewSecure8', null),
  ]);
  expect(res.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  await expect(redeemPasswordLink(db, old, 'OtherSecure8', null)).rejects.toThrow('already used');
  const login = await attemptLogin({email,password:'NewSecure8',expectedRole:'TEAM'},db);
  expect(login.mfaRequired).toBe(true);
  expect(login.session).toBeUndefined();
  expect(await db.prepare("SELECT id FROM sessions WHERE user_id='redeem'").first()).toBeNull();
  expect(
    (await db.prepare("SELECT id FROM audit_logs WHERE action='PASSWORD_CHANGE' AND target_id='redeem'").all())
      .results,
  ).toHaveLength(1);
});
it('invalidates a link on login email change, and rejects expired links', async () => {
  const token = await issue('invalidate@example.invalid');
  await db.prepare("UPDATE users SET email='changed@example.invalid' WHERE id='invalidate'").run();
  await expect(redeemPasswordLink(db, token, 'OtherSecure8', null)).rejects.toThrow('already used');
  const expired = await issue('expire@example.invalid');
  await db.prepare("UPDATE password_resets SET expires_at=1 WHERE user_id='expire'").run();
  await expect(redeemPasswordLink(db, expired, 'OtherSecure8', null)).rejects.toThrow('expired');
});
it('queues nothing for an unknown login email', async () => {
  await db.batch(passwordLinkStatements(db, 'unknown@example.invalid', 'reset', fixtureSecret, Date.now()));
  expect(
    await db.prepare("SELECT id FROM email_outbox WHERE recipient='unknown@example.invalid'").first(),
  ).toBeNull();
});
