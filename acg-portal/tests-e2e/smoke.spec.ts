import { test, expect } from '@playwright/test';

// End-to-end smoke of the signature flows against a running, seeded app.
// Requires the app on E2E_BASE_URL (default http://localhost:3000) and the seed.

const INVESTOR_EMAIL = process.env.SEED_INVESTOR_EMAIL ?? 'm.vance@gmail.com';
const INVESTOR_PASSWORD = process.env.SEED_INVESTOR_PASSWORD ?? 'ChangeMe!Inv1234';
const TEAM_EMAIL = process.env.SEED_TEAM_EMAIL ?? 'james@acg.example';
const TEAM_PASSWORD = process.env.SEED_TEAM_PASSWORD ?? 'ChangeMe!Team123';

async function signIn(page: import('@playwright/test').Page, role: 'Investor' | 'Investor Relations', email: string, password: string) {
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
  await expect(page.getByText('$3,750').first()).toBeVisible();
  await expect(page.getByText('14 of 24 distributions paid')).toBeVisible();
  await expect(page.getByText('April 14, 2027')).toBeVisible();
});

test('investor schedule shows distributed-to-date and ledger', async ({ page }) => {
  await signIn(page, 'Investor', INVESTOR_EMAIL, INVESTOR_PASSWORD);
  await page.waitForURL('**/portal/overview');
  await page.getByRole('link', { name: 'Schedule' }).click();
  await page.waitForURL('**/portal/schedule');
  await expect(page.getByText('$52,500')).toBeVisible();
  await expect(page.getByText('$37,500')).toBeVisible();
});

test('investor submits a request via quick action', async ({ page }) => {
  await signIn(page, 'Investor', INVESTOR_EMAIL, INVESTOR_PASSWORD);
  await page.waitForURL('**/portal/overview');
  await page.getByRole('button', { name: 'Request document' }).click();
  await expect(page.getByText('New request')).toBeVisible();
  await page.getByRole('button', { name: 'Submit request' }).click();
  await page.waitForURL('**/portal/requests');
  await expect(page.getByText('Request a document').first()).toBeVisible();
});

test('team sees the portfolio overview and queues', async ({ page }) => {
  await signIn(page, 'Investor Relations', TEAM_EMAIL, TEAM_PASSWORD);
  await page.waitForURL('**/console/overview');
  await expect(page.getByText('Portfolio overview')).toBeVisible();
  await expect(page.getByText('Pending registrations')).toBeVisible();
  await expect(page.getByText('Approaching maturities')).toBeVisible();
});

test('team can open the investors roster and a detail slide-over', async ({ page }) => {
  await signIn(page, 'Investor Relations', TEAM_EMAIL, TEAM_PASSWORD);
  await page.waitForURL('**/console/overview');
  await page.getByRole('link', { name: 'Investors', exact: true }).click();
  await page.waitForURL('**/console/investors');
  await expect(page.getByText('Margaret Vance').first()).toBeVisible();
  await page.getByText('Margaret Vance').first().click();
  await expect(page.getByText('Wire received')).toBeVisible();
});
