import { test, expect, type Page } from '@playwright/test';
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
test('shot52: header band + enlarged security tab', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await signIn(page);
  await page.goto('/account-overview');
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'e2e/results/shot52-account.png' });
  const hasHeader = await page.getByRole('heading', { name: 'Account Overview' }).isVisible().catch(() => false);
  const mainW = await page.evaluate(() => {
    const m = document.querySelector('main');
    const inner = m?.firstElementChild as HTMLElement | null;
    return { vw: window.innerWidth, main: m?.getBoundingClientRect().width ?? 0, inner: inner?.getBoundingClientRect().width ?? 0 };
  });
  console.log('WIDTHS:', JSON.stringify(mainW));
  // 9-tab audit sweep (#69/#70): mid-scroll shot per tab — the sticky rail
  // must stay in view; no giant dead columns.
  const TABS = ['Account', 'Usage', 'FinOps', 'Data Objects', 'Data Quality', 'Security', 'Platform', 'Projects', 'Organization'];
  for (const t of TABS) {
    const tab = page.locator('[role="tab"]', { hasText: t }).first();
    if (!(await tab.isVisible().catch(() => false))) continue;
    await tab.click().catch(() => {});
    await page.waitForTimeout(9000);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
    await page.waitForTimeout(800);
    const railInView = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('nav, aside, div'));
      return els.some((e) => {
        const r = e.getBoundingClientRect();
        return r.left > window.innerWidth - 420 && r.width > 180 && r.height > 250 && r.top < 200 && r.bottom > 400;
      });
    });
    console.log('TABAUDIT', t, 'railInView:', railInView);
    await page.screenshot({ path: `e2e/results/audit-${t.toLowerCase().replace(/ /g, '')}.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
  }
  const hz = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log('HEADER:', hasHeader, 'HSCROLL:', hz, 'ERRS:', errs.length);
  expect(hasHeader).toBe(true);
  expect(hz).toBeLessThanOrEqual(8);
  expect(errs).toEqual([]);
});
