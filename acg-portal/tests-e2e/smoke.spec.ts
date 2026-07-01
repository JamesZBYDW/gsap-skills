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

test('requests and messages nav reflect the trimmed scope', async ({ page }) => {
  await signIn(page, 'Investor', INVESTOR_EMAIL, INVESTOR_PASSWORD);
  await page.waitForURL('**/portal/overview');
  // Requests removed; Messages kept.
  await expect(page.getByRole('link', { name: 'Requests' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Messages' })).toBeVisible();
});

test('team overview shows registrations + investor replies (no requests card)', async ({ page }) => {
  await signIn(page, 'Investor Relations', TEAM_EMAIL, TEAM_PASSWORD);
  await page.waitForURL('**/console/overview');
  await expect(page.getByText('Portfolio overview')).toBeVisible();
  await expect(page.getByText('Pending registrations')).toBeVisible();
  await expect(page.getByText('Open requests')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Requests' })).toHaveCount(0);
});

// The signature closed loop: management provisions a login + sets note terms,
// then the investor signs in with those credentials and sees the schedule.
test('management provisions login + note terms; investor signs in and sees schedule', async ({ page }) => {
  const email = 'crest.login@acg.example';
  const password = 'Harbor2026xyz';

  await signIn(page, 'Investor Relations', TEAM_EMAIL, TEAM_PASSWORD);
  await page.waitForURL('**/console/overview');
  await page.getByRole('link', { name: 'Investors', exact: true }).click();
  await page.waitForURL('**/console/investors');
  await page.getByText('Crest Harbor Holdings').first().click();

  // Set note terms -> Active with an explicit schedule.
  await page.getByTestId('mn-principal').fill('750,000');
  await page.getByTestId('mn-rate').fill('15');
  await page.getByTestId('mn-amount').fill('9,375');
  await page.getByTestId('mn-day').fill('1');
  await page.getByTestId('mn-first').fill('2026-08-01');
  await page.getByTestId('mn-maturity').fill('2028-02-01');
  await page.getByTestId('mn-status').selectOption('ACTIVE');
  await page.getByTestId('mn-save').click();
  await expect(page.getByText('Note terms saved — schedule updated')).toBeVisible();

  // Provision a login the investor can use.
  await page.getByText('Crest Harbor Holdings').first().click();
  await page.getByTestId('cred-email').fill(email);
  await page.getByTestId('cred-password').fill(password);
  await page.getByRole('checkbox').uncheck();
  await page.getByTestId('cred-save').click();
  await expect(page.getByText(/Login set/)).toBeVisible();

  // Close the slide-over (its overlay covers the top bar), then sign out.
  await page.keyboard.press('Escape');
  // Sign out (team) and sign in as the newly provisioned investor.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/login');
  await signIn(page, 'Investor', email, password);
  await page.waitForURL('**/portal/overview');
  await expect(page.getByText('$750,000')).toBeVisible();

  // The schedule reflects the management-entered terms.
  await page.getByRole('link', { name: 'Schedule' }).click();
  await page.waitForURL('**/portal/schedule');
  await expect(page.getByText('Aug 1, 2026').first()).toBeVisible();
  await expect(page.getByText('$9,375').first()).toBeVisible();
});
