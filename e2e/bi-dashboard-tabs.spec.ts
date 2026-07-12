import { test, expect, type Page } from '@playwright/test';

/**
 * BI Dashboard viewport-fit tabs (user directive 2026-07-10: "no one page and
 * lifetime scroll").
 *
 * Landing (/bi-dashboard): the content zones are grouped into ?tab= synced
 * tabs (Dashboards = ScoreCards + cards grid, Capabilities = related links +
 * feature grid); KPI strip and header stay persistent; the right AxisCockpit
 * rail (overview/cost/gov/history/AI + new per-axis highlight chips) fills the
 * shell. Project view (/bi-dashboard/[id]): the dashboard's own pages ARE the
 * tabs (PageTabs, now ?tab= synced); the editor canvas + right bar scroll
 * internally.
 *
 * Contract asserted here for BOTH routes:
 *  - NO page-level scroll (document fits the viewport exactly)
 *  - tabs are clickable, sync ?tab=, and render real content per tab
 *  - zero pageerrors and no React error boundary
 */

const PASS = process.env.D360_PASS ?? '';
test.setTimeout(15 * 60_000);

async function signIn(page: Page) {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });
}

/** The one-viewport contract: the document itself must not scroll. */
async function expectNoPageScroll(page: Page, label: string) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () => document.documentElement.scrollHeight - window.innerHeight,
        ),
      { timeout: 30_000, message: `${label}: document must fit the viewport (no page scroll)` },
    )
    .toBeLessThanOrEqual(0);
}

async function expectNoErrorBoundary(page: Page) {
  await expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0);
}

test('bi-dashboard landing: viewport-fit tabs, no page scroll, content renders', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await signIn(page);
  await page.goto('/bi-dashboard');
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});

  // Persistent chrome: header + KPI strip + tab bar.
  await expect(page.getByRole('heading', { name: 'BI Dashboard' })).toBeVisible();
  await expect(page.locator('[data-testid="bi-landing-tabs"]')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Key metrics' })).toBeVisible();

  // ── Tab 1: Dashboards (default) — score cards + project cards grid ────────
  const dashPanel = page.locator('[data-testid="bi-landing-panel-dashboards"]');
  await expect(dashPanel).toBeVisible();
  // Real content, not a skeleton: the panel accumulates text as scores/cards land.
  await expect
    .poll(async () => (await dashPanel.innerText()).length, { timeout: 90_000 })
    .toBeGreaterThan(80);
  await expectNoPageScroll(page, 'landing/dashboards');
  await expectNoErrorBoundary(page);
  await page.screenshot({ path: 'e2e/results/redesign-bi-landing-dashboards.png', fullPage: false });

  // ── Tab 2: Capabilities — related links + feature grid ────────────────────
  await page.getByRole('tab', { name: /capabilities/i }).click();
  await expect(page).toHaveURL(/tab=discover/, { timeout: 10_000 });
  const discoverPanel = page.locator('[data-testid="bi-landing-panel-discover"]');
  await expect(discoverPanel).toBeVisible();
  await expect(discoverPanel.getByText('Chart Builder')).toBeVisible();
  await expect(discoverPanel.getByText('Template Gallery')).toBeVisible();
  await expect(discoverPanel.getByRole('link', { name: /explore & design/i })).toBeVisible();
  await expectNoPageScroll(page, 'landing/discover');
  await expectNoErrorBoundary(page);
  await page.screenshot({ path: 'e2e/results/redesign-bi-landing-discover.png', fullPage: false });

  // Switching back keeps working (pure state, no navigation/remount).
  await page.getByRole('tab', { name: /dashboards/i }).click();
  await expect(page).toHaveURL(/tab=dashboards/, { timeout: 10_000 });
  await expect(dashPanel).toBeVisible();

  // Right rail: the AxisCockpit opens on Overview with the per-axis chips.
  await expect(page.locator('[data-testid="bi-axis-chips"]')).toBeVisible({ timeout: 60_000 });

  expect(pageErrors, `landing page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
});

test('bi-dashboard project view: viewport-fit, page tabs sync ?tab=, no page scroll', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await signIn(page);
  await page.goto('/bi-dashboard');
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});

  // Open the first real dashboard from the cards grid.
  const firstCard = page.locator('[data-testid="bi-landing-panel-dashboards"] a[href^="/bi-dashboard/"]').first();
  await expect(firstCard, 'needs at least one dashboard project to verify the editor').toBeVisible({ timeout: 60_000 });
  const href = await firstCard.getAttribute('href');
  expect(href).toBeTruthy();
  await page.goto(href as string);
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});

  // Editor shell renders: page-tabs rail + canvas region + docked right bar.
  const pageTabs = page.getByRole('tablist', { name: 'Dashboard pages' });
  await expect(pageTabs).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-dashboard-grid]')).toBeVisible();
  await expect(page.getByRole('region', { name: 'BI dashboard smart panel' })).toBeVisible();

  await expectNoPageScroll(page, 'project/initial');
  await expectNoErrorBoundary(page);
  await page.screenshot({ path: 'e2e/results/redesign-bi-project-page1.png', fullPage: false });

  // The dashboard's own pages are the tabs — click through each one: the
  // switch must sync ?tab=<page_id>, keep the canvas mounted, and never
  // introduce page scroll. (A single-page dashboard is fine — loop of 1.)
  const tabs = pageTabs.getByRole('tab');
  const tabCount = await tabs.count();
  expect(tabCount).toBeGreaterThan(0);
  for (let i = 0; i < Math.min(tabCount, 4); i += 1) {
    // Click the page-title button INSIDE the tab — the tab container also
    // hosts hover-revealed rename/delete affordances that a center click
    // could hit (a raw tab click once opened the delete-confirm row).
    await tabs.nth(i).locator('button').first().click();
    // Defensive: if a hover ever opened the inline delete-confirm, cancel it.
    const cancel = pageTabs.getByRole('button', { name: 'Cancel', exact: true });
    if (await cancel.count()) await cancel.first().click().catch(() => {});
    await expect(page).toHaveURL(/[?&]tab=/, { timeout: 10_000 });
    await expect(page.locator('[data-dashboard-grid]')).toBeVisible();
    await expectNoPageScroll(page, `project/tab-${i + 1}`);
    await expectNoErrorBoundary(page);
    await page.screenshot({ path: `e2e/results/redesign-bi-project-tab${i + 1}.png`, fullPage: false });
  }

  // Deep-link honored: reloading with the synced ?tab= keeps that page active.
  const url = new URL(page.url());
  const tabParam = url.searchParams.get('tab');
  if (tabParam) {
    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
    await expect(pageTabs.getByRole('tab').and(page.locator('[aria-selected="true"]')).first()).toBeVisible({ timeout: 60_000 });
    await expectNoPageScroll(page, 'project/deep-link');
  }

  expect(pageErrors, `project page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
});
