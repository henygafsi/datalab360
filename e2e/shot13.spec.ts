import { test, type Page } from '@playwright/test';
const PASS = process.env.D360_PASS ?? '';
test.setTimeout(300_000);
test.use({ viewport: { width: 1440, height: 900 } });
async function signIn(page: Page) {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name, input[placeholder*="ccount"]').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username, input[placeholder*="ser"]').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 120_000 });
}
test('13-inch: E&D catalog + modeling with panel open', async ({ page }) => {
  await signIn(page);
  for (const view of ['catalog', 'modeling']) {
    await page.goto(`/explore-design?project_id=proj_d850771ce218&view=${view}`);
    await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
    await page.waitForTimeout(6000);
    const expand = page.locator('button[aria-label="Expand panel"]');
    if (await expand.isVisible().catch(() => false)) { await expand.click().catch(() => {}); await page.waitForTimeout(1500); }
    // worst case: the Release (deploy) tab is the widest panel
    const rel = page.locator('[role="tab"][aria-label="Release"]');
    if (await rel.isVisible().catch(() => false)) { await rel.click().catch(() => {}); await page.waitForTimeout(3000); }
    await page.screenshot({ path: `e2e/results/shot13-${view}.png` });
    const tip = await page.locator('[role="tooltip"]').evaluateAll((els) => els.filter((e) => getComputedStyle(e).opacity === '1').length);
    console.log(view, 'stuck tooltips:', tip);
    const m = await page.evaluate(() => ({ hs: document.documentElement.scrollWidth - window.innerWidth }));
    console.log(view, 'hscroll:', m.hs);
  }
});
