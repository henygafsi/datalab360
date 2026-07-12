import { test, expect, type Page } from '@playwright/test';

/**
 * ed-certify — exhaustive Explore & Design certification (user mandate Jul 11:
 * "playwright until it's good"). For each sample project and each view:
 * open EVERY right-bar tab (the Cost & KPIs panel crashed for 2 days on a
 * phantom API contract), click into a table detail, and assert ZERO
 * pageerrors and no error boundary anywhere along the walk.
 */
const PASS = process.env.D360_PASS ?? '';
test.setTimeout(45 * 60_000);

const PROJECTS = ['proj_27fcf868068a', 'proj_d850771ce218', 'proj_7128ea4d5352', 'proj_c5233deb508f'];

async function signIn(page: Page) {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name, input[placeholder*="ccount"]').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username, input[placeholder*="ser"]').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 120_000 });
}

async function noBoundary(page: Page, ctx: string) {
  expect(
    await page.getByText('Something went wrong', { exact: false }).isVisible().catch(() => false),
    `${ctx}: error boundary`,
  ).toBe(false);
}

async function assertAligned(page: Page, ctx: string) {
  const m = await page.evaluate(() => {
    const main = document.querySelector('main');
    const r = main ? main.getBoundingClientRect() : { left: 0, right: 0 };
    const kids = main ? Array.from(main.querySelectorAll(':scope > * > *')).slice(0, 30) : [];
    const minLeft = kids.length ? Math.min(...kids.map((k) => k.getBoundingClientRect().left)) : r.left;
    return { hscroll: document.documentElement.scrollWidth - window.innerWidth, mainLeft: r.left, minLeft };
  });
  expect(m.hscroll, `${ctx}: horizontal overflow ${m.hscroll}px`).toBeLessThanOrEqual(8);
  expect(m.minLeft, `${ctx}: content slides under sidebar (minLeft ${m.minLeft} < main ${m.mainLeft - 8})`).toBeGreaterThanOrEqual(m.mainLeft - 8);
}

test('E&D: every right-bar tab + table detail on both views, zero pageerrors', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String((e as Error).stack || e).slice(0, 300)));
  await signIn(page);

  for (const proj of PROJECTS) {
    for (const view of ['catalog', 'modeling']) {
      const ctx = `${proj}/${view}`;
      await page.goto(`/explore-design?project_id=${proj}&view=${view}`);
      await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
      await page.waitForTimeout(6000);
      await noBoundary(page, ctx);
      await assertAligned(page, ctx);

      // Ensure the right panel is open (collapsed state shows the mini-rail).
      const expand = page.locator('button[aria-label="Expand panel"]');
      if (await expand.isVisible().catch(() => false)) {
        await expand.click().catch(() => {});
        await page.waitForTimeout(1500);
      }

      // Walk EVERY tab of every tablist (right bar included).
      const tabs = page.locator('[role="tab"]');
      const n = await tabs.count();
      let walked = 0;
      for (let i = 0; i < n; i++) {
        const t = tabs.nth(i);
        if (!(await t.isVisible().catch(() => false))) continue;
        await t.click({ timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(3500);
        await noBoundary(page, `${ctx} tab#${i}`);
        walked++;
      }
      console.log(`${ctx}: ${walked} tabs walked, errs so far: ${errs.length}`);

      // Also poke non-tab rail buttons (aria-label'd icon rail entries).
      const railBtns = page.locator('aside button[aria-label], [data-rail] button');
      const rn = Math.min(await railBtns.count(), 12);
      for (let i = 0; i < rn; i++) {
        const b = railBtns.nth(i);
        if (!(await b.isVisible().catch(() => false))) continue;
        await b.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(2000);
        await noBoundary(page, `${ctx} rail#${i}`);
      }

      // Dedupe contract: on the Release tab the header must NOT show the
      // navigation-only 'Review & deploy' button (it would be a dead no-op).
      const releaseTab = page.locator('[role="tab"][aria-label="Release"]');
      if (await releaseTab.isVisible().catch(() => false)) {
        await releaseTab.click().catch(() => {});
        await page.waitForTimeout(2500);
        expect(
          await page.getByRole('button', { name: 'Review & deploy' }).isVisible().catch(() => false),
          `${ctx}: self-pointing deploy button on Release tab`,
        ).toBe(false);
      }

      // catalog64: the MAIN view bar is a tablist too (Catalog…Insights), so the
      // walk above ends on its last tab. Return to the requested view before
      // the view-specific detail step.
      const viewTab = page.locator(`[role="tab"][aria-label="${view === 'catalog' ? 'Catalog view' : 'Modeling view'}"]`);
      if (await viewTab.isVisible().catch(() => false)) {
        await viewTab.click().catch(() => {});
        await page.waitForTimeout(2500);
      }

      if (view === 'catalog') {
        // Click into a table detail and back.
        const row = page.locator('main').getByText('DIM_CLIENTS', { exact: false }).first();
        if (await row.isVisible().catch(() => false)) {
          await row.click().catch(() => {});
          await page.waitForTimeout(4000);
          await noBoundary(page, `${ctx} table-detail`);
        }
      }
      await page.screenshot({ path: `e2e/results/edcert-${proj.slice(-6)}-${view}.png` });
    }
  }
  expect(errs, `pageerrors:\n${errs.join('\n---\n')}`).toEqual([]);
});
