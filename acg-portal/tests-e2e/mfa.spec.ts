import { test, expect, type Page } from '@playwright/test';
import { base32Decode, hotp, totpStep } from '../src/lib/totp';

// Two-factor authentication through the real UI and APIs. Each test turns 2FA
// off again at the end, so the seeded accounts are left as they were.

const TEAM_EMAIL = process.env.SEED_TEAM_EMAIL ?? 'james@acg.example';
const TEAM_PASSWORD = process.env.SEED_TEAM_PASSWORD ?? 'ChangeMe!Team123';
const INVESTOR_EMAIL = process.env.SEED_INVESTOR_EMAIL ?? 'm.vance@gmail.com';
const INVESTOR_PASSWORD = process.env.SEED_INVESTOR_PASSWORD ?? 'ChangeMe!Inv1234';

async function signIn(page: Page, role: 'Investor' | 'Investor Relations', email: string, password: string) {
  await page.goto('/login');
  await page.getByText(role, { exact: true }).click();
  await page.locator('input[autocomplete="username"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

const NO_STORE = 'private, no-store';

/** Call a 2FA settings endpoint directly with the page's cookies (same origin). */
async function settingsApi(page: Page, path: string, data: Record<string, string>) {
  return page.request.post(path, { data, headers: { origin: new URL(page.url()).origin } });
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/login');
}

/** Turn 2FA on from the Security page; returns the TOTP secret, the enrollment step and the recovery codes. */
async function enroll(page: Page, password: string) {
  await page.getByRole('link', { name: 'Security' }).click();
  await expect(page.getByTestId('mfa-status')).toHaveText('Off');
  await page.getByTestId('mfa-enable').click();
  await page.getByTestId('mfa-password').fill(password);
  const [startRes] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/mfa/enroll/start')),
    page.getByTestId('mfa-start').click(),
  ]);
  expect(startRes.headers()['cache-control']).toBe(NO_STORE); // carries the TOTP secret
  const secret = base32Decode((await page.getByTestId('mfa-secret').innerText()).replace(/\s/g, ''));
  await expect(page.getByAltText('QR code for your authenticator app')).toBeVisible();
  const step = totpStep(Date.now());
  await page.getByTestId('mfa-confirm-code').fill(await hotp(secret, step));
  const [confirmRes] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/mfa/enroll/confirm')),
    page.getByTestId('mfa-confirm').click(),
  ]);
  expect(confirmRes.headers()['cache-control']).toBe(NO_STORE); // carries the recovery codes
  const codesText = await page.getByTestId('mfa-recovery-codes').innerText();
  const codes = codesText.split(/\s+/).filter((c) => /^[0-9a-z]{5}-[0-9a-z]{5}$/.test(c));
  expect(codes).toHaveLength(10);
  await page.getByTestId('mfa-codes-done').click();
  await expect(page.getByTestId('mfa-status')).toHaveText('On');
  return { secret, step, codes };
}

async function disableWith(page: Page, password: string, code: string) {
  await page.getByRole('link', { name: 'Security' }).click();
  await page.getByTestId('mfa-disable').click();
  await page.getByTestId('mfa-reauth-password').fill(password);
  await page.getByTestId('mfa-reauth-code').fill(code);
  await page.getByTestId('mfa-reauth-submit').click();
  await expect(page.getByTestId('mfa-status')).toHaveText('Off');
}

test('staff: enroll, second step required, wrong code rejected, TOTP and recovery code sign-ins, safe disable', async ({ page }) => {
  await signIn(page, 'Investor Relations', TEAM_EMAIL, TEAM_PASSWORD);
  await page.waitForURL('**/console/overview');
  const { secret, step, codes } = await enroll(page, TEAM_PASSWORD);

  // Password alone no longer signs in: only the challenge page, no session.
  await signOut(page);
  await signIn(page, 'Investor Relations', TEAM_EMAIL, TEAM_PASSWORD);
  await page.waitForURL('**/login/mfa');
  await page.goto('/console/overview');
  await page.waitForURL('**/login');
  await signIn(page, 'Investor Relations', TEAM_EMAIL, TEAM_PASSWORD);
  await page.waitForURL('**/login/mfa');

  // A wrong code is refused; the next step's code (window ±1) is accepted.
  const right = await hotp(secret, step + 1);
  await page.getByTestId('mfa-code').fill(right === '000000' ? '111111' : '000000');
  await page.getByTestId('mfa-submit').click();
  await expect(page.getByTestId('mfa-error')).toHaveText('That code is not valid.');
  await page.getByTestId('mfa-code').fill(right);
  await page.getByTestId('mfa-submit').click();
  await page.waitForURL('**/console/overview');
  await expect(page.getByText('Portfolio overview')).toBeVisible();

  // A recovery code signs in once.
  await signOut(page);
  await signIn(page, 'Investor Relations', TEAM_EMAIL, TEAM_PASSWORD);
  await page.waitForURL('**/login/mfa');
  await page.getByTestId('mfa-toggle-recovery').click();
  await page.getByTestId('mfa-code').fill(codes[0]!);
  await page.getByTestId('mfa-submit').click();
  await page.waitForURL('**/console/overview');
  await page.getByRole('link', { name: 'Security' }).click();
  await expect(page.getByTestId('mfa-recovery-remaining')).toHaveText('9');

  // Turning it off needs the password AND a code; a wrong password is refused.
  await page.getByTestId('mfa-disable').click();
  await page.getByTestId('mfa-reauth-password').fill('Wrong2026password');
  await page.getByTestId('mfa-reauth-code').fill(codes[1]!);
  await page.getByTestId('mfa-reauth-submit').click();
  await expect(page.getByTestId('mfa-settings-error')).toHaveText('Password is incorrect.');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await disableWith(page, TEAM_PASSWORD, codes[1]!);

  // Back to password-only sign-in.
  await signOut(page);
  await signIn(page, 'Investor Relations', TEAM_EMAIL, TEAM_PASSWORD);
  await page.waitForURL('**/console/overview');
});

test('investor: enroll from the portal, staff impersonation is read-only, sign-in needs the code', async ({ page }) => {
  await signIn(page, 'Investor', INVESTOR_EMAIL, INVESTOR_PASSWORD);
  await page.waitForURL('**/portal/overview');
  const { secret, step, codes } = await enroll(page, INVESTOR_PASSWORD);
  await signOut(page);

  // Investor Relations viewing the portal sees the status but no controls.
  await signIn(page, 'Investor Relations', TEAM_EMAIL, TEAM_PASSWORD);
  await page.waitForURL('**/console/overview');
  await page.getByRole('link', { name: 'Investors', exact: true }).click();
  await page.waitForURL('**/console/investors');
  await page.getByText('Margaret Vance').first().click();
  await page.getByRole('button', { name: /View investor portal/i }).click();
  await page.waitForURL('**/portal/overview');
  await page.getByRole('link', { name: 'Security' }).click();
  await expect(page.getByTestId('mfa-status')).toHaveText('On');
  await expect(page.getByText('Read-only view. Only the account holder can change two-factor settings.')).toBeVisible();
  await expect(page.getByTestId('mfa-disable')).toHaveCount(0);
  await expect(page.getByTestId('mfa-enable')).toHaveCount(0);
  // While the read-only view is active, the settings APIs refuse even direct
  // calls — neither the investor's nor the staff member's own factor changes.
  const blocked = await settingsApi(page, '/api/mfa/enroll/start', { password: TEAM_PASSWORD });
  expect(blocked.status()).toBe(403);
  expect(await blocked.json()).toEqual({ error: 'Read-only view.' });
  expect((await settingsApi(page, '/api/mfa/disable', { password: TEAM_PASSWORD, code: codes[5]! })).status()).toBe(403);
  await page.goto('/console/security');
  await expect(page.getByText('Stop viewing the investor portal before changing your two-factor settings.')).toBeVisible();
  await expect(page.getByTestId('mfa-enable')).toHaveCount(0);
  await page.goto('/console/overview');
  await signOut(page);

  // The investor now needs the second factor.
  await signIn(page, 'Investor', INVESTOR_EMAIL, INVESTOR_PASSWORD);
  await page.waitForURL('**/login/mfa');
  await page.getByTestId('mfa-code').fill(await hotp(secret, step + 1));
  await page.getByTestId('mfa-submit').click();
  await page.waitForURL('**/portal/overview');
  await expect(page.getByText('$250,000')).toBeVisible();

  await disableWith(page, INVESTOR_PASSWORD, codes[0]!);
});

test('a session still on a management-issued password cannot change two-factor settings', async ({ page }) => {
  const email = 'mfa.gate@acg.example';
  const issued = 'Gate2026x';

  await signIn(page, 'Investor Relations', TEAM_EMAIL, TEAM_PASSWORD);
  await page.waitForURL('**/console/overview');
  await page.getByRole('link', { name: 'Create account', exact: true }).click();
  await page.waitForURL('**/console/create');
  await page.getByTestId('ca-name').fill('MFA Gate Test LLC');
  await page.getByTestId('ca-email').fill(email);
  await page.getByTestId('ca-principal').fill('500,000');
  await page.getByTestId('ca-rate').fill('15');
  await page.getByTestId('ca-password').fill(issued); // "require change" stays checked
  await page.getByTestId('ca-submit').click();
  await page.waitForURL('**/console/investors');
  await signOut(page);

  await signIn(page, 'Investor', email, issued);
  await page.waitForURL('**/change-password');
  // The Security page is unreachable, and the API refuses a direct call.
  await page.goto('/portal/security');
  await page.waitForURL('**/change-password');
  const res = await settingsApi(page, '/api/mfa/enroll/start', { password: issued });
  expect(res.status()).toBe(403);
  expect(await res.json()).toEqual({ error: 'Set your password before changing two-factor settings.' });
});
