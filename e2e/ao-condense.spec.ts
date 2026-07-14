import { test, expect } from '@playwright/test';
const PASS = process.env.D360_PASS ?? '';
test.use({ viewport: { width: 1600, height: 950 } });
test.setTimeout(6 * 60_000);
test('account tab: Executive Overview collapsed into down-bar, no errors', async ({ page }) => {
  const errs:string[]=[]; page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(()=>{});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(()=>{});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u)=>!u.pathname.includes('/signin'), { timeout: 90_000 });
  await page.goto('/account-overview');
  await page.waitForTimeout(25000); // settle (Account tab is default)
  const drawer = await page.getByText('Executive cross-module summary', { exact: false }).count();
  const m = await page.evaluate(() => ({ sh: document.body.scrollHeight, vh: window.innerHeight }));
  console.log('DRAWER_PRESENT=', drawer, 'scrollHeight=', m.sh, '(was 2625) errs=', errs.length);
  await page.screenshot({ path: 'e2e/ao-shots2/account-condensed.png' }).catch(()=>{});
  expect(drawer, 'Executive summary down-bar label present').toBeGreaterThan(0);
  expect(errs, `page errors: ${errs.join(';')}`).toHaveLength(0);
  expect(m.sh, 'scroll should be reduced from 2625').toBeLessThan(2625);
});
