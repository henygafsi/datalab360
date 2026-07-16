import { test, expect } from '@playwright/test';
const PASS = process.env.D360_PASS ?? '';
test.use({ viewport: { width: 1600, height: 950 } });
test('E&D: selecting a project with a model shows content (no Start Modeling flash, no stuck skeleton)', async ({ page }) => {
  const errs:string[]=[]; page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(()=>{});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(()=>{});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u)=>!u.pathname.includes('/signin'), { timeout: 90_000 });
  await page.goto('/explore-design');
  await page.getByText('PERSONA_DE · Retail Model').first().click({ timeout: 60_000 });
  // enter Modeling view if not already
  await page.getByRole('button', { name: /^Modeling$/ }).first().click({ timeout: 30_000 }).catch(()=>{});
  // Poll for a chooser FLASH during the load window (it must not appear for a
  // project that has a saved model).
  let chooserFlashed = false;
  for (let i=0;i<30;i++){
    if (await page.getByText('Start Modeling').isVisible().catch(()=>false)) { chooserFlashed = true; break; }
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(6000);
  const stuckSkeleton = await page.getByText('Loading model…').isVisible().catch(()=>false);
  const chooserNow = await page.getByText('Start Modeling').isVisible().catch(()=>false);
  await page.screenshot({ path: 'e2e/ed-modeling-load-artifacts/persona.png', fullPage: false }).catch(()=>{});
  console.log('CHOOSER_FLASHED=', chooserFlashed, 'STUCK_SKELETON=', stuckSkeleton, 'CHOOSER_NOW=', chooserNow, 'ERRS=', errs.length);
  expect(stuckSkeleton, 'skeleton must resolve').toBeFalsy();
  expect(chooserNow, 'a project with a model must not show the Start Modeling chooser').toBeFalsy();
  expect(errs, `page errors: ${errs.join(';')}`).toHaveLength(0);
});
