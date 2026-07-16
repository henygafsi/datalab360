import { test, expect } from '@playwright/test';
const PASS = process.env.D360_PASS ?? '';
test.use({ viewport: { width: 1400, height: 900 } });
test('ChunkErrorReloader reloads once on ChunkLoadError, then guards against loop', async ({ page }) => {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(()=>{});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(()=>{});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u)=>!u.pathname.includes('/signin'), { timeout: 90_000 });
  await page.goto('/governance');
  await page.waitForTimeout(6000); // let the 4s guard-clear pass so we're re-armed

  // Tag this document instance; a reload replaces it.
  await page.evaluate(() => { (window as any).__navMarker = 'first'; });
  // Fire a synthetic ChunkLoadError.
  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'ChunkLoadError: Loading chunk _foo_bar failed.' }));
  });
  await page.waitForTimeout(3000);
  const markerAfter1 = await page.evaluate(() => (window as any).__navMarker);
  const reloadedOnce = markerAfter1 !== 'first'; // marker gone => document reloaded

  // Immediately fire again — guard (sessionStorage flag still set) must prevent a 2nd reload.
  await page.evaluate(() => { (window as any).__navMarker2 = 'set'; });
  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'ChunkLoadError: Loading chunk _foo_bar failed.' }));
  });
  await page.waitForTimeout(2500);
  const markerAfter2 = await page.evaluate(() => (window as any).__navMarker2);
  const didNotLoop = markerAfter2 === 'set'; // still set => no second reload

  console.log('RELOADED_ONCE=', reloadedOnce, 'DID_NOT_LOOP=', didNotLoop);
  expect(reloadedOnce, 'should reload on ChunkLoadError').toBeTruthy();
  expect(didNotLoop, 'should NOT reload a second time (loop guard)').toBeTruthy();
});
