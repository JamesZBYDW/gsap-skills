import { randomUUID } from 'node:crypto';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

// Wrangler Local Explorer exposes the *local* email binding's captured messages.
// Run against a freshly seeded local Worker with EMAIL_LINK_SECRET and ACG_EMAIL configured.
const explorer = '/cdn-cgi/local/explorer/api/local';

async function openMailLink(page: Page, request: APIRequestContext, recipient: string, subject: string) {
  // Invoke the Worker on this test's port, even when another local instance shares its name.
  const scheduled = await request.get('/cdn-cgi/local/scheduled', { params: { cron: '* * * * *' } });
  expect(scheduled.status()).toBe(200);
  expect((await scheduled.text()).trim()).toBe('ok');
  let messageId: string | undefined;
  await expect.poll(async () => {
    const response = await request.get(`${explorer}/email/sending?worker=acg-portal&per_page=100`);
    const messages = (await response.json()).result as {messageId: string; to: string[]; subject: string}[];
    messageId = messages.find(m => m.to.includes(recipient) && m.subject === subject)?.messageId;
    return Boolean(messageId);
  }).toBe(true);
  const response = await request.get(`${explorer}/email/sending`, { params: { worker: 'acg-portal', email_id: messageId! } });
  const body = (await response.json()).result.text as string;
  const match = /https:\/\/[^\s]+(\/set-password#token=[A-Za-z0-9_-]+)/.exec(body);
  if (!match) throw new Error('Captured local message is missing its password setup link');
  // Keep the emailed path and fragment, using the local server as the browser origin.
  await page.goto(match[1]!);
}

async function choosePassword(page: Page, value: string) {
  await page.getByLabel('New password', { exact: true }).fill(value);
  await page.getByLabel('Confirm new password', { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('status')).toContainText('Your password is ready');
}

async function signIn(page: Page, email: string, password: string, team = false) {
  await page.goto('/login');
  await page.getByText(team ? 'Investor Relations' : 'Investor', { exact: true }).click();
  await page.locator('input[autocomplete="username"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(team ? '**/console/overview' : '**/portal/overview');
}

test('investor activates an emailed invitation, requests a reset and signs in with the replacement password', async ({ page, request, baseURL }) => {
  test.setTimeout(60_000);
  if (!baseURL || !['localhost','127.0.0.1','[::1]'].includes(new URL(baseURL).hostname)) {
    throw new Error('Email browser test requires a local Wrangler server and its simulated email binding');
  }
  const recipient = `e2e-${randomUUID()}@example.invalid`;
  await signIn(page, process.env.SEED_TEAM_EMAIL ?? 'james@acg.example', process.env.SEED_TEAM_PASSWORD ?? 'ChangeMe!Team123', true);
  await page.getByRole('link', { name: 'Create account', exact: true }).click();
  await page.getByTestId('ca-name').fill('Email Integration Investor');
  await page.getByTestId('ca-email').fill(recipient);
  await page.getByTestId('ca-principal').fill('150,000');
  await page.getByTestId('ca-rate').fill('12');
  await expect(page.getByTestId('ca-send-invite')).toBeChecked();
  await page.getByTestId('ca-submit').click();
  await page.waitForURL('**/console/investors');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/login');

  await openMailLink(page, request, recipient, 'Your ACG Investor Portal invitation');
  await choosePassword(page, 'PortalPass123');
  await signIn(page, recipient, 'PortalPass123');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/login');
  await page.getByRole('link', { name: /forgot.*password/i }).click();
  await page.getByLabel('Login email').fill(recipient);
  await page.getByRole('button', { name: 'Email password link' }).click();
  await expect(page.getByRole('status')).toContainText('If that email has a portal account');
  await openMailLink(page, request, recipient, 'Reset your ACG portal password');
  await choosePassword(page, 'ChangedPass123');
  await signIn(page, recipient, 'ChangedPass123');
  await expect(page.getByRole('link', { name: 'Documents' })).toBeVisible();
});
