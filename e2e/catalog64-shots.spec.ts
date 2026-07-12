import { test, expect, type Page } from '@playwright/test';

/**
 * catalog64-shots — screenshot harness for the Explore & Design catalog
 * redesign (mockup catalog64 + addenda #66/#68). Captures, at 1920×1080 and
 * 1440×900: the default catalog view, a selected-table state, the Columns
 * sub-tab, the right-bar Create group, and the modeling single-toolbar canvas
 * with the Quick Actions band.
 */
const PASS = process.env.D360_PASS ?? '';
test.setTimeout(15 * 60_000);

const PROJ = 'proj_27fcf868068a';

async function signIn(page: Page) {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name, input[placeholder*="ccount"]').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username, input[placeholder*="ser"]').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 120_000 });
}

for (const vp of [{ w: 1920, h: 1080 }, { w: 1440, h: 900 }] as const) {
  test(`catalog64 shots @${vp.w}x${vp.h}`, async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(String((e as Error).stack || e).slice(0, 400)));
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await signIn(page);

    // 1 — default catalog view
    await page.goto(`/explore-design?project_id=${PROJ}&view=catalog`);
    await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
    await page.waitForTimeout(8000);
    await page.screenshot({ path: `e2e/results/catalog64-default-${vp.w}.png` });

    // 2 — selected-table state (click a table in the left rail)
    const row = page.locator('main').getByText('DIM_CLIENTS', { exact: false }).first();
    if (await row.isVisible().catch(() => false)) {
      await row.click().catch(() => {});
      await page.waitForTimeout(6000);
    }
    await page.screenshot({ path: `e2e/results/catalog64-selected-${vp.w}.png` });

    // 3 — Columns sub-tab
    const colsTab = page.locator('[role="tab"]', { hasText: /^Columns \(/ }).first();
    if (await colsTab.isVisible().catch(() => false)) {
      await colsTab.click().catch(() => {});
      await page.waitForTimeout(2500);
    }
    await page.screenshot({ path: `e2e/results/catalog64-columns-${vp.w}.png` });

    // 4 — right-bar Create group (open the Actions section via header Create)
    const createBtn = page.getByRole('button', { name: 'Create', exact: true }).first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click().catch(() => {});
      await page.waitForTimeout(2000);
      const group = page.getByTestId('rightbar-create-group');
      if (await group.isVisible().catch(() => false)) {
        const details = group.locator('details');
        if (!(await details.getAttribute('open').catch(() => null))) {
          await group.locator('summary').click().catch(() => {});
          await page.waitForTimeout(800);
        }
      }
    }
    await page.screenshot({ path: `e2e/results/catalog64-create-group-${vp.w}.png` });

    // 5 — modeling: single toolbar + Quick Actions band
    await page.goto(`/explore-design?project_id=${PROJ}&view=modeling`);
    await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
    await page.waitForTimeout(9000);
    await page.screenshot({ path: `e2e/results/catalog64-modeling-${vp.w}.png` });

    expect(errs, `pageerrors:\n${errs.join('\n---\n')}`).toEqual([]);
  });
}
