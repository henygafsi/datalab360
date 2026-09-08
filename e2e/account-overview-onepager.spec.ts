import { test, expect, type Page } from '@playwright/test';

/**
 * Account Overview — TABBED one-pager (updated 2026-09 restructure). The 10
 * sections render as a HORIZONTAL tablist (SectionTabs, SHORT labels); the
 * main column renders ONLY the active section inside a viewport-fit frame
 * whose inner area is the single scrolling surface.
 *
 * Contract guarded here:
 *   1. the PAGE never scrolls (document scrollHeight <= viewport + epsilon),
 *   2. every section tab is clickable and renders its content (or an honest
 *      empty/degraded/preparing state — never a blank),
 *   3. the analytical header resolves (Domains ready tile: value or honest —),
 *   4. legacy ?section= ids (overview / snowflake-objects / dwh-plan /
 *      modules …) still deep-link via the alias map,
 *   5. zero "Something went wrong", zero pageerrors.
 *
 * Run with:  npx playwright test e2e/account-overview-onepager.spec.ts \
 *              --output=e2e/.tmp-tax
 * (NEVER the default output dir — it would wipe e2e/results.)
 */

const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';
test.skip(!PASS, 'D360_PASS not set');
test.setTimeout(15 * 60_000);

// SectionTabs renders SHORT accessible names (labels below), 10 sections.
const SECTIONS: Array<{ id: string; label: string }> = [
  { id: 'account', label: 'Account' },
  { id: 'usage-performance', label: 'Usage' },
  { id: 'finops', label: 'FinOps' },
  { id: 'data-objects', label: 'Objects' },
  { id: 'data-quality', label: 'Quality' },
  { id: 'security', label: 'Security' },
  { id: 'platform-activity', label: 'Activity' },
  { id: 'projects', label: 'Projects' },
  { id: 'organization', label: 'Organization' },
  { id: 'actions', label: 'Actions' },
];

async function signIn(page: Page) {
  await page.goto('/signin');
  // Placeholder-based locators match the current signin form; no silent
  // .catch swallowing — a missed field must fail HERE, not at waitForURL.
  await page.getByPlaceholder('Enter your account name').fill(ACCOUNT);
  await page.getByPlaceholder('Enter your username').fill(USER);
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

  // ── The 10 section tabs exist in the horizontal tablist. ──
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(10, { timeout: 60_000 });

  // ── Zero page scroll: the ViewportFitFrame pins everything above the
  //    fold; poll until the async strip + measurement settle. ──
  await expect
    .poll(() => pageScrollExcess(page), {
      timeout: 60_000,
      message: 'page must not scroll (viewport-fit frame)',
    })
    .toBeLessThanOrEqual(8);

  // ── Analytical header resolves: the Domains-ready coverage tile shows a
  //    value or an honest "—" (skeletons must resolve to one of them). ──
  const coverage = page
    .locator('div', { has: page.getByText('Domains ready', { exact: true }) })
    .last();
  await expect(coverage).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(async () => (await coverage.innerText()).trim(), { timeout: 120_000 })
    .toMatch(/\d+\/\d+|—/);

  // ── Every section tab is clickable, syncs ?section=, renders content. ──
  for (const s of SECTIONS) {
    await page.getByRole('tab', { name: s.label, exact: true }).click();
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
      path: `e2e/results/tax-${s.id}.png`,
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

  // ── Legacy alias deep-links: OLD ids must resolve to the new taxonomy. ──
  for (const [legacy, canonical, label] of [
    ['overview', 'account', 'Account'],
    ['snowflake-objects', 'data-objects', 'Objects'],
    ['dwh-plan', 'account', 'Account'],
    ['modules', 'platform-activity', 'Activity'],
  ] as const) {
    await page.goto(`/account-overview?section=${legacy}`);
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await expect(
      page.locator(`#cc-panel-${canonical}`),
      `legacy ?section=${legacy} must land on ${canonical}`,
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole('tab', { name: label, exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
  }

  expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
});
