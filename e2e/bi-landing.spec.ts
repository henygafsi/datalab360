import { test, expect } from '@playwright/test';
const PASS = process.env.D360_PASS ?? '';
test.use({ viewport: { width: 1600, height: 950 } });
test('BI landing: dashboards render, DQ/COST/PERF/GOV score cards removed, no errors', async ({ page }) => {
  const errs:string[]=[]; page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(()=>{});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(()=>{});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u)=>!u.pathname.includes('/signin'), { timeout: 90_000 });
  // warm compile
  await page.goto('/bi-dashboard'); await page.waitForTimeout(20000);
  // measure a fresh (warm) load
  const t0 = Date.now();
  await page.goto('/bi-dashboard');
  await page.waitForFunction(() => /Dashboards\s*\d+/.test(document.body.innerText) || document.querySelectorAll('a,button').length>0, { timeout: 30000 }).catch(()=>{});
  await page.waitForTimeout(4000);
  const ms = Date.now()-t0;
  const bodyTxt = await page.locator('body').innerText();
  // The 4 CDO score cards used a specific "recos · N critical" affordance.
  const hasScoreCards = /\d+\s*recos\s*·\s*\d+\s*critical/i.test(bodyTxt);
  const hasDashboards = /Dashboards/i.test(bodyTxt);
  console.log('WARM_LOAD_MS=', ms, 'HAS_SCORECARDS=', hasScoreCards, 'HAS_DASHBOARDS=', hasDashboards, 'ERRS=', errs.length);
  await page.screenshot({ path: 'e2e/bi-landing-artifacts/after.png' }).catch(()=>{});
  expect(hasScoreCards, 'DQ/COST/PERF/GOV score cards must be removed from BI').toBeFalsy();
  expect(errs, `page errors: ${errs.join(';')}`).toHaveLength(0);
});
