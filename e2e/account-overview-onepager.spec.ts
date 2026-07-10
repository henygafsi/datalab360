import { test, expect, type Page } from '@playwright/test';

/**
 * Account Overview — TABBED redesign (2026-07-10, "no one-page lifetime
 * scroll"). The 9 former stacked sections are now tabs: the main column
 * renders ONLY the active section inside a viewport-fit frame whose inner
 * area is the single scrolling surface, and the right rail (SectionRail) is
 * the navigation — one entry per section with per-axis highlight chips
 * (DQ · GOV · COST · PERF) plus a pending-access badge on Security.
 *
 * Contract guarded here:
 *   1. the PAGE never scrolls (document scrollHeight <= viewport + epsilon),
 *   2. every section tab is clickable and renders its content (or an honest
 *      empty/degraded state — never a blank),
 *   3. rail highlight chips render (value or honest "—"),
 *   4. zero "Something went wrong", zero pageerrors.
 *
 * Run with:  npx playwright test e2e/account-overview-onepager.spec.ts \
 *              --output=e2e/.tmp-ao-redesign
 * (NEVER the default output dir — it would wipe e2e/results.)
 */

const PASS = process.env.D360_PASS ?? '';
test.setTimeout(15 * 60_000);

const SECTIONS: Array<{ id: string; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'dwh-plan', label: 'DWH Action Plan' },
  { id: 'snowflake-objects', label: 'Data Objects' },
  { id: 'finops', label: 'FinOps' },
  { id: 'modules', label: 'Modules' },
  { id: 'platform-activity', label: 'Platform Activity' },
  { id: 'projects', label: 'Projects' },
  { id: 'security', label: 'Security' },
  { id: 'organization', label: 'Organization' },
];

async function signIn(page: Page) {
  await page.goto('/signin');
  // Placeholder-based locators match the current signin form; no silent
  // .catch swallowing — a missed field must fail HERE, not at waitForURL.
  await page.getByPlaceholder('Enter your account name').fill('uchsfvb-HAHA');
  await page.getByPlaceholder('Enter your username').fill('HAHA');
  await page.getByPlaceholder('Enter your password').fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });
}

/** document scrollHeight (page-level, NOT the frame's inner scroller). */
async function pageScrollExcess(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
    );
    return doc - window.innerHeight;
  });
}

test('account-overview: tabbed sections, zero page scroll, rail highlights', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await signIn(page);
  await page.goto('/account-overview');
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});

  // ── The 9 section tabs exist in the rail (role=tab, single tablist). ──
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(9, { timeout: 60_000 });

  // ── Zero page scroll: the ViewportFitFrame pins everything above the
  //    fold; poll until the async strip + measurement settle. ──
  await expect
    .poll(() => pageScrollExcess(page), {
      timeout: 60_000,
      message: 'page must not scroll (viewport-fit frame)',
    })
    .toBeLessThanOrEqual(8);

  // ── Rail highlight chips render for the Overview entry (value or honest
  //    "—" — skeletons must resolve to one of them). ──
  const overviewChips = page.getByTestId('cc-rail-chips-overview');
  await expect(overviewChips).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => (await overviewChips.innerText()).trim(), { timeout: 60_000 })
    .toMatch(/DQ|GOV|COST|PERF/);

  // ── Every section tab is clickable, syncs ?section=, renders content. ──
  for (const s of SECTIONS) {
    // Click the icon/label row (top-left) — the button's geometric center can
    // land on the nested axis-chip row, which is its own click target.
    await page
      .getByRole('tab', { name: s.label, exact: true })
      .click({ position: { x: 24, y: 14 } });
    await expect(page).toHaveURL(new RegExp(`section=${s.id}`), { timeout: 15_000 });

    const panel = page.locator(`#cc-panel-${s.id}`);
    await expect(panel).toBeVisible({ timeout: 30_000 });

    // Content (or an honest empty/degraded state) must materialize — a
    // skeleton is allowed transiently but the panel must not stay blank.
    await expect
      .poll(async () => (await panel.innerText()).trim().length, {
        timeout: 120_000,
        message: `section "${s.label}" must render content`,
      })
      .toBeGreaterThan(80);

    // The page itself still doesn't scroll on this tab.
    await expect
      .poll(() => pageScrollExcess(page), {
        timeout: 30_000,
        message: `zero page scroll on "${s.label}"`,
      })
      .toBeLessThanOrEqual(8);

    // No crash surface anywhere on this tab.
    await expect(page.getByText('Something went wrong')).toHaveCount(0);

    // Let charts/tables paint before the evidence shot.
    await page.waitForTimeout(1_500);
    await page.screenshot({
      path: `e2e/results/redesign-ao-${s.id}.png`,
      fullPage: false,
    });
  }

  // ── Responsive gate: zero page scroll at the three reference sizes
  //    (dashboard grids reflow; only boards/table zones scroll internally). ──
  for (const vp of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(vp);
    // Give the ViewportFitFrame's resize re-measure a beat to settle.
    await page.waitForTimeout(1_200);
    await expect
      .poll(() => pageScrollExcess(page), {
        timeout: 30_000,
        message: `zero page scroll at ${vp.width}x${vp.height}`,
      })
      .toBeLessThanOrEqual(8);
  }
  await page.setViewportSize({ width: 1920, height: 1080 });

  // ── Deep-link: ?section= restores the tab (legacy ?tab= also resolves). ──
  await page.goto('/account-overview?section=finops');
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
  await expect(page.locator('#cc-panel-finops')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('tab', { name: 'FinOps', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
});
