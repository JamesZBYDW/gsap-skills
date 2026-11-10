import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function signIn(page: Page, side: string, email: string, password: string) {
  await page.goto('/login');
  await page.getByText(side, { exact: true }).click();
  await page.locator('input[autocomplete="username"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('staff record the final distribution and the investor sees its actual date, reference and total', async ({ page }) => {
  const runId = randomUUID();
  const name = `Payment test ${runId}`;
  const email = `payment-${runId}@example.test`;
  const password = 'Synthetic2026payment';
  const reference = `WIRE-${runId.slice(0, 8)}`;
  await signIn(page, 'Investor Relations', process.env.SEED_TEAM_EMAIL ?? 'james@acg.example', process.env.SEED_TEAM_PASSWORD ?? 'ChangeMe!Team123');
  await page.waitForURL('**/console/overview');
  const account = await page.evaluate(async (body) => {
    const response = await fetch('/api/team/accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, investorId: (await response.json()).investorId as string };
  }, { name, email, password, sendInvite: false, mustChange: false, principal: '100,000', ratePercent: 12, termMonths: 12, wireReceivedDate: '2024-01-01' });
  expect(account.status).toBe(200);
  expect(account.investorId).toBeTruthy();

  await page.goto('/console/investors');
  await page.getByText(name, { exact: true }).click();
  const select = page.getByTestId('payment-distribution');
  const final = select.locator('option').filter({ hasText: '$101,000' });
  await expect(final).toHaveCount(1);
  const distributionId = (await final.getAttribute('value'))!;
  await select.selectOption(distributionId);
  await page.getByTestId('payment-date').fill('2025-01-15');
  await page.getByTestId('payment-reference').fill(reference);
  await page.getByTestId('payment-record').click();
  await expect(page.getByTestId('payment-total')).toContainText('$101,000 recorded across 1 of 12');
  await page.getByText('Recorded payments (1)', { exact: true }).click();
  await expect(page.getByText(`#12 · $101,000 · Paid 2025-01-15 · ${reference}`, { exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/login');
  await signIn(page, 'Investor', email, password);
  await page.waitForURL('**/portal/overview');
  const total = page.locator('.card').filter({ has: page.getByText('DISTRIBUTED TO DATE', { exact: true }) });
  await expect(total.getByText('$101,000', { exact: true })).toBeVisible();
  const ledgerRow = page.locator('.tableRow').filter({ hasText: reference });
  await expect(ledgerRow).toContainText('Paid');
  await expect(ledgerRow).toContainText('Jan 15, 2025');
  await expect(ledgerRow).toContainText('$101,000');

  // The investor's valid session cannot post through the staff endpoint.
  const denied = await page.evaluate(async ({ investorId, distributionId }) => (await fetch(`/api/team/investors/${investorId}/payments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ distributionId, paidDate: '2025-01-15', reference: 'forbidden' }),
  })).status, { investorId: account.investorId, distributionId });
  expect(denied).toBe(403);
});
