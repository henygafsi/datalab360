import { test, expect } from '@playwright/test';
const PASS = process.env.D360_PASS ?? '';
test.setTimeout(10 * 60_000);
test('account-overview shows the Problems strip with real numbers', async ({ page }) => {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(()=>{});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(()=>{});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(u => !u.pathname.includes('/signin'), { timeout: 90_000 });

  await page.goto('/account-overview');
  const strip = page.getByRole('region', { name: /problems across the account/i });
  await expect(strip).toBeVisible({ timeout: 180_000 });
  // Hard numbers land first (data-first); the Cortex narrative fills in behind
  // them (~13s inference), so wait for it to resolve or degrade honestly.
  await expect(strip).toContainText(/Failed queries/i);
  await expect
    .poll(async () => (await strip.innerText()).includes('Reading the error history'),
          { timeout: 240_000, intervals: [2_000] })
    .toBe(false);

  const text = await strip.innerText();
  console.log('STRIP_TEXT:', text.replace(/\n/g, ' | ').slice(0, 500));
  expect(text).toMatch(/Failed queries/i);
  // Either a real narrative or an honest 'Summary unavailable' — never a fake one.
  expect(text).toMatch(/NEXT:|Summary unavailable|briefing/i);
  await page.screenshot({ path: 'e2e/results/problems-strip.png' });
});
