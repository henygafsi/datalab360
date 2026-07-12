import { test, expect, type Page } from '@playwright/test';

/**
 * tabs-validation — the main-column twin of axis-validation (2026-07-11).
 *
 * For EVERY page with the one-page-tabs pattern: walk each tab of each
 * visible tablist and assert the enterprise-minimal contract —
 *   1. no error boundary, zero pageerrors,
 *   2. zero HORIZONTAL page scroll (vertical growth is by-design since #52),
 *   3. the active panel carries REAL content (not an empty shell).
 * Tab bars are discovered live (role=tablist/tab), so tab renames or
 * additions do not silently escape validation.
 */
const PASS = process.env.D360_PASS ?? '';
test.setTimeout(30 * 60_000);

const PAGES: Array<{ route: string; label: string; minTabs?: number }> = [
  { route: '/account-overview', label: 'account-overview', minTabs: 8 },
  { route: '/data-quality', label: 'data-quality', minTabs: 4 },
  { route: '/bi-dashboard', label: 'bi-landing', minTabs: 2 },
  { route: '/deploy-app', label: 'deploy-app', minTabs: 2 },
  { route: '/workflow/dev-tools', label: 'dev-tools', minTabs: 4 },
  { route: '/explore-design/catalog', label: 'catalog', minTabs: 3 },
  { route: '/admin/performance', label: 'admin-performance', minTabs: 5 },
  { route: '/intelligent?tab=semantic-models', label: 'intelligent', minTabs: 4 },
];

async function signIn(page: Page) {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name, input[placeholder*="ccount"]').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username, input[placeholder*="ser"]').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });
}

async function assertNoPageScroll(page: Page, ctx: string) {
  const m = await page.evaluate(() => ({
    sh: document.documentElement.scrollHeight,
    ih: window.innerHeight,
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }));
  // #52 contract: VERTICAL page scroll is by-design (content enlarged, the
  // page grows; scroll lives at page level, not in cramped inner cells).
  // Horizontal overflow is still a defect.
  void m.sh; void m.ih;
  expect(m.sw, `${ctx}: horizontal page scroll (${m.sw} > ${m.iw})`).toBeLessThanOrEqual(m.iw + 8);
}

test('every page: all main tabs render real content with zero page scroll', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await signIn(page);

  const report: string[] = [];
  for (const p of PAGES) {
    await page.goto(p.route);
    await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
    // data-first: give the slowest first-fetch a moment before judging content
    await page.waitForTimeout(4000);

    expect(
      await page.getByText('Something went wrong', { exact: false }).isVisible().catch(() => false),
      `${p.label}: error boundary`,
    ).toBe(false);
    await assertNoPageScroll(page, `${p.label}[load]`);

    // Discover the MAIN tab bars (exclude the right rail's tablist by taking
    // horizontal tablists / the first ones in DOM order; walk them all anyway —
    // rails must satisfy the same contract).
    const tablists = page.locator('[role="tablist"]');
    const nLists = await tablists.count();
    let walked = 0;
    for (let li = 0; li < nLists; li++) {
      const tabs = tablists.nth(li).locator('[role="tab"]');
      const nTabs = await tabs.count();
      for (let ti = 0; ti < nTabs; ti++) {
        const tab = tabs.nth(ti);
        if (!(await tab.isVisible().catch(() => false))) continue;
        const name = ((await tab.innerText().catch(() => '')) || `tab${ti}`).split('\n')[0].slice(0, 30);
        await tab.click({ timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(2500);
        expect(
          await page.getByText('Something went wrong', { exact: false }).isVisible().catch(() => false),
          `${p.label} › ${name}: error boundary`,
        ).toBe(false);
        await assertNoPageScroll(page, `${p.label} › ${name}`);
        const textLen = await page.evaluate(() => (document.querySelector('main') ?? document.body).innerText.length);
        expect(textLen, `${p.label} › ${name}: empty shell (${textLen} chars)`).toBeGreaterThan(200);
        walked++;
      }
    }
    if (p.minTabs) {
      expect(walked, `${p.label}: expected >= ${p.minTabs} tabs, walked ${walked}`).toBeGreaterThanOrEqual(p.minTabs);
    }
    report.push(`${p.label}: ${walked} tabs OK`);
  }
  console.log('TABS_VALIDATION:', report.join(' | '));
  expect(errs, `pageerrors: ${errs.join(' ;; ')}`).toEqual([]);
});
