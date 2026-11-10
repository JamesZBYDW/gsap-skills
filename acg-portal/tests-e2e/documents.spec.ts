import { test, expect, type Page } from '@playwright/test';
import { testPdf } from '../test/support/pdf';

async function signIn(page: Page, role: 'Investor' | 'Investor Relations', email: string, password: string) {
  await page.goto('/login');
  await page.getByText(role, { exact: true }).click();
  await page.locator('input[autocomplete="username"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(role === 'Investor' ? '**/portal/overview' : '**/console/overview');
}

test('management uploads a private PDF and its investor downloads the original bytes', async ({ page }) => {
  const token = crypto.randomUUID();
  const name = 'PDF Investor ' + token.slice(0, 8);
  const email = 'pdf-' + token + '@example.invalid';
  const password = 'PrivateDocument2026!';
  const filename = 'Executed agreement.pdf';
  const bytes = testPdf();

  await signIn(page, 'Investor Relations', process.env.SEED_TEAM_EMAIL ?? 'james@acg.example',
    process.env.SEED_TEAM_PASSWORD ?? 'ChangeMe!Team123');
  // Use the browser's actual origin and the local test runner's DNS mapping.
  const created = await page.evaluate(async (fixture) => {
    const response = await fetch('/api/team/accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fixture),
    });
    return response.status;
  }, { name, email, type: 'INDIVIDUAL', principal: '', ratePercent: 18, termMonths: 24,
    wireReceivedDate: null, password, mustChange: false, sendInvite: false });
  expect(created).toBeGreaterThanOrEqual(200);
  expect(created).toBeLessThan(300);

  await page.goto('/console/investors');
  await page.getByText(name, { exact: true }).click();
  await page.getByTestId('document-kind').selectOption('AGREEMENT');
  await page.getByTestId('document-file').setInputFiles({ name: filename, mimeType: 'application/pdf', buffer: bytes });
  await page.getByTestId('document-upload').click();
  const fileLink = page.getByRole('link', { name: filename, exact: true });
  await expect(fileLink).toBeVisible();
  const href = (await fileLink.getAttribute('href'))!;
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sign out' }).click();

  await signIn(page, 'Investor', email, password);
  await page.getByRole('link', { name: 'Documents', exact: true }).click();
  const received = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download ' + filename }).click();
  const download = await received;
  expect(download.suggestedFilename()).toBe(filename);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks)).toEqual(bytes);
  await page.getByRole('button', { name: 'Sign out' }).click();

  await signIn(page, 'Investor', process.env.SEED_INVESTOR_EMAIL ?? 'm.vance@gmail.com',
    process.env.SEED_INVESTOR_PASSWORD ?? 'ChangeMe!Inv1234');
  await page.getByRole('link', { name: 'Documents', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Download ' + filename })).toHaveCount(0);
  expect(await page.evaluate(async (path) => (await fetch(path)).status, href)).toBe(403);
});
