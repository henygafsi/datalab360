import { test, expect } from '@playwright/test';

const USER = process.env.D360_USER ?? 'HAHA';
const PASS = process.env.D360_PASS ?? '';
const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-HAHA';

/** Sign in through the real /signin form, then land on the dashboard. */
async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/signin');
  await page.getByPlaceholder(/account/i).first().fill(ACCOUNT).catch(() => {});
  await page.locator('input[name="account_name"], input#account_name').first().fill(ACCOUNT).catch(() => {});
  await page.locator('input[name="username"], input#username').first().fill(USER).catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });
}

test('explore-design ?view=catalog renders without error boundary', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));

  await signIn(page);
  await page.goto('/explore-design?project_id=proj_01c59ad751d8&view=catalog');
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});

  const boundary = page.getByText('Something went wrong', { exact: false });
  const crashed = await boundary.isVisible().catch(() => false);

  console.log('PAGE_ERRORS:', JSON.stringify(pageErrors, null, 1));
  console.log('CONSOLE_ERRORS:', JSON.stringify(consoleErrors.slice(0, 8), null, 1));
  await page.screenshot({ path: 'e2e/results/catalog-view.png', fullPage: true });

  expect(crashed, `error boundary shown; pageErrors=${pageErrors.join(' | ')}`).toBe(false);
});
