/**
 * Targeted smoke for the refactored connector page (/data-source-connection):
 *  - prompt-first ConnectorPromptBar is visible inline (no popup)
 *  - the picker exposes the new "Custom API (Open Data)" card
 *  - no error boundary
 * Sign-in uses the documented re-fill-until-it-sticks loop (next dev HMR can
 * clear the account field mid-fill). Creds via D360_USER/D360_PASS/D360_ACCOUNT.
 */
import { test, expect, Page } from '@playwright/test';

const USER = process.env.D360_USER ?? 'HAHA';
const PASS = process.env.D360_PASS ?? '';
const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-HAHA';

test.setTimeout(8 * 60_000);

async function signIn(page: Page) {
  await page.goto('/signin', { waitUntil: 'domcontentloaded' });
  const account = page.locator('input[name="account_name"], input#account_name').first();
  const user = page.locator('input[name="username"], input#username').first();
  const pass = page.locator('input[type="password"]').first();
  await account.waitFor({ state: 'visible', timeout: 120_000 });
  // Re-fill until it sticks: dev-mode HMR can wipe fields mid-fill.
  for (let i = 0; i < 6; i++) {
    await account.fill(ACCOUNT).catch(() => {});
    await user.fill(USER).catch(() => {});
    await pass.fill(PASS).catch(() => {});
    await page.waitForTimeout(400);
    const ok =
      (await account.inputValue().catch(() => '')) === ACCOUNT &&
      (await user.inputValue().catch(() => '')) === USER &&
      (await pass.inputValue().catch(() => '')).length > 0;
    if (ok) break;
  }
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 120_000 });
}

test('connector page: prompt bar inline + Custom API card present', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);

  await page.goto('/data-source-connection', { waitUntil: 'domcontentloaded' });

  // Wait out the on-demand dev compile: poll for the prompt bar.
  const promptBar = page.getByText('Describe your source — get the right connector');
  await expect(promptBar).toBeVisible({ timeout: 180_000 });

  // No error boundary.
  expect(await page.getByText('Something went wrong', { exact: false }).isVisible().catch(() => false)).toBe(false);

  // The prompt bar is inline (textarea rendered on the page, no dialog).
  await expect(page.getByLabel('Describe your data source')).toBeVisible();
  expect(await page.locator('[role="dialog"]').count()).toBe(0);

  // Open the picker if it is collapsed (connections may already exist), then
  // assert the new Custom API card is present.
  const customApiCard = page.getByText('Custom API (Open Data)');
  if (!(await customApiCard.isVisible().catch(() => false))) {
    await page.getByText('Add connection', { exact: false }).first().click().catch(() => {});
  }
  await expect(customApiCard).toBeVisible({ timeout: 30_000 });

  await page.screenshot({ path: 'e2e/results/connector-wizard-smoke-1440x900.png', fullPage: true });
});
