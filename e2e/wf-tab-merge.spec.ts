import { test, expect } from '@playwright/test';
const PASS = process.env.D360_PASS ?? '';
test.use({ viewport: { width: 1600, height: 950 } });
test('workflow: Results rail tab removed (merged into Run history), no errors', async ({ page }) => {
  const errs:string[]=[]; page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(()=>{});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(()=>{});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u)=>!u.pathname.includes('/signin'), { timeout: 90_000 });
  await page.goto('/workflow?project=proj_bf6e32758ab5');
  await page.waitForSelector('[aria-label="Workflow smart panel"]', { timeout: 60_000 });
  await page.waitForTimeout(4000);
  const resultsTab = await page.locator('[aria-label="Results"]').count();
  const runsTab = await page.locator('[aria-label="Run history"]').count();
  // click Run history and confirm it renders
  await page.locator('[aria-label="Run history"]').first().click({ timeout: 15000 }).catch(()=>{});
  await page.waitForTimeout(3000);
  const bodyHasRunHistory = await page.getByText(/Run history|No results yet|No runs|Execution/i).first().isVisible().catch(()=>false);
  console.log('RESULTS_TAB=', resultsTab, 'RUNS_TAB=', runsTab, 'RUN_HISTORY_RENDERS=', bodyHasRunHistory, 'ERRS=', errs.length);
  expect(resultsTab, 'Results rail tab must be removed').toBe(0);
  expect(runsTab, 'Run history rail tab must remain').toBeGreaterThan(0);
  expect(errs, `page errors: ${errs.join(';')}`).toHaveLength(0);
});
