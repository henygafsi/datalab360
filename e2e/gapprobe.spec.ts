import { test, type Page } from '@playwright/test';
const PASS = process.env.D360_PASS ?? '';
test.setTimeout(300_000);
async function signIn(page: Page) {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name, input[placeholder*="ccount"]').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username, input[placeholder*="ser"]').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 120_000 });
}
test('gap probe: fixed-height pages after padding slim', async ({ page }) => {
  await signIn(page);
  for (const r of ['/explore-design/catalog', '/data-quality', '/workflow/dev-tools', '/deploy-app']) {
    await page.goto(r);
    await page.waitForLoadState('networkidle', { timeout: 90_000 }).catch(() => {});
    await page.waitForTimeout(4000);
    const g = await page.evaluate(() => {
      const footer = document.querySelector('footer');
      const fTop = footer ? footer.getBoundingClientRect().top : window.innerHeight;
      // deepest clamped frame: any div with a calc(100dvh height style via class
      const cand = Array.from(document.querySelectorAll('main div')).filter((d) => /100dvh-22/.test(d.className));
      const bottom = cand.length ? Math.max(...cand.map((d) => d.getBoundingClientRect().bottom)) : 0;
      return { route: location.pathname, gap: Math.round(fTop - bottom), scrollY: document.documentElement.scrollHeight - window.innerHeight };
    });
    console.log('GAP:', JSON.stringify(g));
  }
});
