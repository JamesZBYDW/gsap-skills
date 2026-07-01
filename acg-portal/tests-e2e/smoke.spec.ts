import { test, expect } from '@playwright/test';

// End-to-end smoke of the signature flows against a running, seeded app.
// Requires the app on E2E_BASE_URL (default http://localhost:3000) and the seed.

const INVESTOR_EMAIL = process.env.SEED_INVESTOR_EMAIL ?? 'm.vance@gmail.com';
const INVESTOR_PASSWORD = process.env.SEED_INVESTOR_PASSWORD ?? 'ChangeMe!Inv1234';
const TEAM_EMAIL = process.env.SEED_TEAM_EMAIL ?? 'james@acg.example';
const TEAM_PASSWORD = process.env.SEED_TEAM_PASSWORD ?? 'ChangeMe!Team123';

type P = import('@playwright/test').Page;

async function signIn(page: P, role: 'Investor' | 'Investor Relations', email: string, password: string) {
  await page.goto('/login');
  await page.getByText(role, { exact: true }).click();
  await page.locator('input[autocomplete="username"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('investor sees their note overview with exact figures', async ({ page }) => {
  await signIn(page, 'Investor', INVESTOR_EMAIL, INVESTOR_PASSWORD);
  await page.waitForURL('**/portal/overview');
  await expect(page.getByText('Good morning, Margaret')).toBeVisible();
  await expect(page.getByText('$250,000')).toBeVisible();
  await expect(page.getByText('18.0%')).toBeVisible();
  await expect(page.getByText('14 of 24 distributions paid')).toBeVisible();
  await expect(page.getByText('April 14, 2027')).toBeVisible();
});

test('investor nav is trimmed — no Requests, no Messages', async ({ page }) => {
  await signIn(page, 'Investor', INVESTOR_EMAIL, INVESTOR_PASSWORD);
  await page.waitForURL('**/portal/overview');
  await expect(page.getByRole('link', { name: 'Requests' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Messages' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Schedule' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Documents' })).toBeVisible();
});

test('team nav/overview reflect no registrations or messages; Create account is present', async ({ page }) => {
  await signIn(page, 'Investor Relations', TEAM_EMAIL, TEAM_PASSWORD);
  await page.waitForURL('**/console/overview');
  await expect(page.getByText('Portfolio overview')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Registrations' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Messages' })).toHaveCount(0);
  await expect(page.getByText('Pending registrations')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Create account', exact: true })).toBeVisible();
});

// Signature loop A: management edits an existing investor's note terms + login
// from the detail panel; that investor then signs in and sees the schedule.
test('management sets terms + login on an existing investor; they sign in and see the schedule', async ({ page }) => {
  const email = 'crest.login@acg.example';
  const password = 'Harbor2026xyz';

  await signIn(page, 'Investor Relations', TEAM_EMAIL, TEAM_PASSWORD);
  await page.waitForURL('**/console/overview');
  await page.getByRole('link', { name: 'Investors', exact: true }).click();
  await page.waitForURL('**/console/investors');
  await page.getByText('Crest Harbor Holdings').first().click();

  await page.getByTestId('mn-principal').fill('750,000');
  await page.getByTestId('mn-rate').fill('15');
  await page.getByTestId('mn-amount').fill('9,375');
  await page.getByTestId('mn-day').fill('1');
  await page.getByTestId('mn-first').fill('2026-08-01');
  await page.getByTestId('mn-maturity').fill('2028-02-01');
  await page.getByTestId('mn-status').selectOption('ACTIVE');
  await page.getByTestId('mn-save').click();
  await expect(page.getByText('Note terms saved — schedule updated')).toBeVisible();

  // Provision a login the investor can use — leave them not forced to change it.
  await page.getByText('Crest Harbor Holdings').first().click();
  await page.getByTestId('cred-email').fill(email);
  await page.getByTestId('cred-password').fill(password);
  await page.getByRole('checkbox').uncheck();
  await page.getByTestId('cred-save').click();
  await expect(page.getByText(/Login set/)).toBeVisible();

  // Close the slide-over (its overlay covers the top bar), then sign out.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/login');
  await signIn(page, 'Investor', email, password);
  await page.waitForURL('**/portal/overview');
  await expect(page.getByText('$750,000')).toBeVisible();

  await page.getByRole('link', { name: 'Schedule' }).click();
  await page.waitForURL('**/portal/schedule');
  await expect(page.getByText('Aug 1, 2026').first()).toBeVisible();
  await expect(page.getByText('$9,375').first()).toBeVisible();
});

// Signature loop B: management creates a whole account in one step (details +
// note terms + login) and requires a first-login password change. The investor
// signs in with the issued password, is forced to set a new one, then lands on
// their overview with the schedule generated from the entered terms.
test('management creates an account; investor is forced to set a password, then sees the schedule', async ({ page }) => {
  const contact = 'northwind@acg.example';
  const issued = 'Northwind2026x';
  const chosen = 'Aurora2026zzz';

  await signIn(page, 'Investor Relations', TEAM_EMAIL, TEAM_PASSWORD);
  await page.waitForURL('**/console/overview');
  await page.getByRole('link', { name: 'Create account', exact: true }).click();
  await page.waitForURL('**/console/create');

  await page.getByTestId('ca-name').fill('Northwind Partners');
  await page.getByTestId('ca-email').fill(contact);
  await page.getByTestId('ca-type-entity').click();
  await page.getByTestId('ca-principal').fill('600,000');
  await page.getByTestId('ca-rate').fill('15');
  await page.getByTestId('ca-amount').fill('7,500');
  await page.getByTestId('ca-day').fill('1');
  await page.getByTestId('ca-first').fill('2026-09-01');
  await page.getByTestId('ca-maturity').fill('2028-03-01');
  await page.getByTestId('ca-status').selectOption('ACTIVE');
  // Login email defaults to the contact email; keep "require change" checked.
  await page.getByTestId('ca-password').fill(issued);
  await page.getByTestId('ca-submit').click();
  await page.waitForURL('**/console/investors');
  await expect(page.getByText('Northwind Partners', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/login');

  // Investor signs in with the issued password and is forced to set a new one.
  await signIn(page, 'Investor', contact, issued);
  await page.waitForURL('**/change-password');
  await expect(page.getByText('Set your password')).toBeVisible();
  await page.getByTestId('fp-new').fill(chosen);
  await page.getByTestId('fp-confirm').fill(chosen);
  await page.getByTestId('fp-submit').click();
  await page.waitForURL('**/portal/overview');
  await expect(page.getByText('$600,000')).toBeVisible();

  await page.getByRole('link', { name: 'Schedule' }).click();
  await page.waitForURL('**/portal/schedule');
  await expect(page.getByText('Sep 1, 2026').first()).toBeVisible();
  await expect(page.getByText('$7,500').first()).toBeVisible();

  // The new password sticks: sign out and back in with it, no forced screen.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/login');
  await signIn(page, 'Investor', contact, chosen);
  await page.waitForURL('**/portal/overview');
  await expect(page.getByText('$600,000')).toBeVisible();
});
