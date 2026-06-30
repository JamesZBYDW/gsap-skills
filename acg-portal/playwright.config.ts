import { defineConfig, devices } from '@playwright/test';

// Chromium is preinstalled in the managed environment at /opt/pw-browsers.
// PLAYWRIGHT_BROWSERS_PATH points there, so no download is needed.
export default defineConfig({
  testDir: './tests-e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // The app server is started manually (or by the test runner script) before
  // running e2e; see DEPLOY.md / package.json. Uncomment to auto-start:
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120_000,
  // },
});
