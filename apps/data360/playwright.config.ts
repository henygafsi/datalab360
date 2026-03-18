import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // 120 s per test: Snowflake auth (~30 s) + navigation + data load
  timeout: 120000,
  expect: { timeout: 20000 },
  fullyParallel: false,
  // 1 retry so flaky tests (first-run login latency) get a second chance
  retries: 1,
  // Run spec files sequentially (workers=1) so session is stable across files
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    headless: true,
    // Re-use the auth state saved by e2e/global-setup.ts for all tests
    storageState: 'e2e/auth-state.json',
  },
  // Global setup: log in once and persist the session cookie
  globalSetup: './e2e/global-setup.ts',
  webServer: {
    command: 'echo "Using existing dev server"',
    port: parseInt(process.env.PLAYWRIGHT_PORT || '3000'),
    reuseExistingServer: true,
  },
});
