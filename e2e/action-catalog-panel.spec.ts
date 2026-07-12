import { test, expect, type Page } from '@playwright/test';
const PASS = process.env.D360_PASS ?? '';
const PROJECT = 'proj_120def6bd075';
test.setTimeout(8 * 60_000);

async function signIn(page: Page) {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 120_000 });
}

test('help rail without a table shows the registry-driven action catalog', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 150)));
  await signIn(page);
  await page.goto(`/explore-design?project_id=${PROJECT}&view=catalog`);
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const helpBtn = page.locator('button[title*="Help" i], button[aria-label*="Help" i]').last();
  if (await helpBtn.isVisible().catch(() => false)) {
    await helpBtn.click();
  } else {
    await page.getByRole('button', { name: /help/i }).last().click().catch(() => {});
  }
  await expect(page.getByText(/actions.*in this module/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/contract-verified live/i)).toBeVisible();
  await page.screenshot({ path: 'e2e/results/action-catalog-panel.png', fullPage: false });
  expect(errs, 'zero pageerrors').toEqual([]);
});
