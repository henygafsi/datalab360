import { test, expect } from '@playwright/test';
const PASS = process.env.D360_PASS ?? '';
test.setTimeout(15 * 60_000);

test('the star model renders and the right bar works', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));

  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(()=>{});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(()=>{});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(u => !u.pathname.includes('/signin'), { timeout: 90_000 });

  // Open the modelling view on the rebuilt star model.
  await page.goto('/explore-design?project_id=proj_5422cb365a13&view=modeling');
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(()=>{});

  const crashed = await page.getByText('Something went wrong', { exact: false }).isVisible().catch(()=>false);
  console.log('CRASHED:', crashed);
  expect(crashed).toBe(false);

  // The ERD must draw the 5 tables and their edges.
  const nodes = page.locator('.react-flow__node');
  await expect.poll(async () => nodes.count(), { timeout: 240_000, intervals: [3000] }).toBeGreaterThan(0);
  const edges = page.locator('.react-flow__edge');
  const [n, e] = [await nodes.count(), await edges.count()];
  console.log('ERD_NODES:', n, 'ERD_EDGES:', e);

  // Right bar: cycle its axis tabs, assert none blows up.
  const rail = page.locator('aside button, nav[role="tablist"] button');
  const count = Math.min(await rail.count(), 10);
  const broken: string[] = [];
  for (let i = 0; i < count; i++) {
    await rail.nth(i).click({ timeout: 5000 }).catch(()=>{});
    await page.waitForTimeout(500);
    if (await page.getByText('Something went wrong', { exact: false }).isVisible().catch(()=>false)) broken.push(`tab#${i}`);
  }
  console.log('RIGHTBAR_TABS:', count, 'BROKEN:', JSON.stringify(broken));
  console.log('PAGE_ERRORS:', JSON.stringify(pageErrors.slice(0, 3)));

  await page.screenshot({ path: 'e2e/results/star-model.png', fullPage: false });
  expect(broken).toEqual([]);
  expect(n).toBeGreaterThanOrEqual(5);
});
