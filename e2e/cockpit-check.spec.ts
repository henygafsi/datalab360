import { test, expect } from '@playwright/test';
const PASS = process.env.D360_PASS ?? '';
test.setTimeout(12 * 60_000);
test('catalog canvas node click opens the 6-axis cockpit', async ({ page }) => {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(()=>{});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(()=>{});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(u => !u.pathname.includes('/signin'), { timeout: 90_000 });

  await page.goto('/explore-design/catalog');
  await page.waitForLoadState('networkidle', { timeout: 90_000 }).catch(()=>{});
  const nodes = page.locator('.react-flow__node');
  await expect.poll(async () => nodes.count(), { timeout: 180_000, intervals: [2000] }).toBeGreaterThan(2);
  console.log('NODES:', await nodes.count());

  await nodes.nth(1).click();
  const cockpit = page.getByRole('tablist', { name: /cockpit axes/i });
  await expect(cockpit).toBeVisible({ timeout: 30_000 });
  console.log('AXES:', (await cockpit.innerText()).replace(/\n/g, ' '));
  const rail = page.locator('aside').filter({ hasText: /Overview|Quality|Governance/ }).first();
  console.log('COCKPIT_BODY:', (await rail.innerText()).replace(/\n/g,' | ').slice(0,200));
  await page.screenshot({ path: 'e2e/results/demo-2b-cockpit.png' });
});
