import { expect, it } from 'vitest';
import { attemptLogin, recordFailedLogin } from '@/lib/auth';
import { b64urlEncode, loadMfaKeys } from '@/lib/mfa-crypto';
import { hashPassword } from '@/lib/password-core';
import { base32Decode, hotp, totpStep } from '@/lib/totp';
import { runPortalEmail } from '@/server/email/dispatch';
import { passwordLinkStatements, redeemPasswordLink } from '@/server/email/password-links';
import { completeChallenge, confirmEnrollment, getMfaStatus, startEnrollment } from '@/server/mfa';
import { freshD1 } from './support/d1';

it('preserves a recovery code for fresh sign-in when an emailed password reset invalidates an open MFA challenge', async () => {
  const { db, dispose } = await freshD1();
  try {
    const userId = crypto.randomUUID();
    const email = 'mfa-email-reset@example.invalid';
    const original = 'BeforeReset2026';
    const replacement = 'AfterReset2026';
    const now = Date.now();
    await db.prepare(`INSERT INTO users (id, role, name, email, password_hash, created_at, updated_at)
      VALUES (?, 'TEAM', 'Recovery fixture', ?, ?, ?, ?)`).bind(userId, email, await hashPassword(original), now, now).run();

    const keys = await loadMfaKeys(b64urlEncode(crypto.getRandomValues(new Uint8Array(32))));
    const setup = await startEnrollment(db, keys, userId, original, null, now);
    const code = await hotp(base32Decode(setup.secret), totpStep(now));
    const recoveryCodes = await confirmEnrollment(db, keys, userId, code, null, now);
    const signIn = (password: string) => attemptLogin({ email, password, expectedRole: 'TEAM' }, db);
    const finish = (token: string) => completeChallenge(db, keys, token, recoveryCodes[0]!, { ip: null },
      (id, checkedHash) => recordFailedLogin(db, id, checkedHash, null));
    const beforeReset = await signIn(original);
    expect(beforeReset.mfaRequired).toBe(true);

    const linkSecret = 'local-test-only-secret-for-password-emails';
    await db.batch(passwordLinkStatements(db, email, 'reset', linkSecret, now));
    let mailedToken: string | null = null;
    await runPortalEmail({
      DB: db, APP_URL: 'https://portal.example.invalid', EMAIL_FROM: 'portal@example.invalid', EMAIL_LINK_SECRET: linkSecret,
      ACG_EMAIL: { async send(message) {
        expect(message.to).toBe(email);
        const link = message.text.split('\n').find(line => line.startsWith('https://portal.example.invalid/set-password#'));
        if (link) mailedToken = new URLSearchParams(new URL(link).hash.slice(1)).get('token');
        return { messageId: 'local-email-reset-test' };
      } },
    });
    if (!mailedToken) throw new Error('Expected a captured reset email');
    await redeemPasswordLink(db, mailedToken, replacement, null);

    expect((await finish(beforeReset.mfaChallenge!.token)).ok).toBe(false);
    expect(await db.prepare('SELECT id FROM sessions WHERE user_id = ?').bind(userId).first()).toBeNull();
    expect((await getMfaStatus(db, userId)).recoveryCodesRemaining).toBe(recoveryCodes.length);

    const afterReset = await signIn(replacement);
    expect(afterReset.mfaRequired).toBe(true);
    expect(await finish(afterReset.mfaChallenge!.token)).toMatchObject({ ok: true, method: 'recovery' });
    expect((await getMfaStatus(db, userId)).recoveryCodesRemaining).toBe(recoveryCodes.length - 1);
  } finally {
    await dispose();
  }
}, 120_000);
