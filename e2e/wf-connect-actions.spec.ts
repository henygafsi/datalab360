import { test, expect, type Page } from '@playwright/test';

/**
 * Workflow › Actions + Connect › Actions — the two new registry-driven action
 * surfaces (GET /workflow/actions, GET /connect/actions). Verifies: page loads
 * authenticated, catalog renders with real counts + area groups, a read-only
 * action runs inline, zero pageerrors. Screenshots to e2e/results/.
 */
const PASS = process.env.D360_PASS ?? '';
test.setTimeout(8 * 60_000);

async function fillSticky(page: Page, selector: string, value: string) {
  // HMR can clear fields mid-fill (memory: login re-fill fix) — retry until it sticks.
  for (let i = 0; i < 5; i++) {
    const loc = page.locator(selector).first();
    await loc.fill(value).catch(() => {});
    if ((await loc.inputValue().catch(() => '')) === value) return;
    await page.waitForTimeout(500);
  }
}

async function signIn(page: Page) {
  await page.goto('/signin');
  await fillSticky(page, 'input[name="account_name"], input#account_name', 'uchsfvb-HAHA');
  await fillSticky(page, 'input[name="username"], input#username', 'HAHA');
  await fillSticky(page, 'input[type="password"]', PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 120_000 });
}

test('workflow actions page renders the catalog and runs a read-only action', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 150)));
  await signIn(page);
  await page.goto('/workflow/actions');
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});

  await expect(page.getByText(/All builder capabilities as actions/i)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/49 capabilities/i)).toBeVisible({ timeout: 60_000 });
  for (const area of ['Build', 'Validate', 'Observe', 'Schedule', 'Govern']) {
    await expect(page.getByText(area, { exact: true }).first()).toBeVisible();
  }
  // Run one inline read-only action (ETL block palette) and expect a result blob.
  const runBtns = page.getByRole('button', { name: 'Run', exact: true });
  await runBtns.first().click();
  await expect(page.locator('pre').first()).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: 'e2e/results/wf-actions-surface.png', fullPage: true });
  expect(errs, 'zero pageerrors').toEqual([]);
});

test('data-quality actions page renders the catalog and runs a read-only action', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 150)));
  await signIn(page);
  await page.goto('/data-quality/actions');
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});

  await expect(page.getByText(/All quality capabilities as actions/i)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/33 capabilities/i)).toBeVisible({ timeout: 60_000 });
  for (const area of ['Checks', 'Metric lifecycle', 'Monitors', 'Anomalies & Trust', 'Reports']) {
    await expect(page.getByText(area, { exact: true }).first()).toBeVisible();
  }
  const runBtns = page.getByRole('button', { name: 'Run', exact: true });
  await runBtns.first().click();
  await expect(page.locator('pre').first()).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: 'e2e/results/dq-actions-surface.png', fullPage: true });
  expect(errs, 'zero pageerrors').toEqual([]);
});

test('sources/catalog actions page renders the catalog and runs a read-only action', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 150)));
  await signIn(page);
  await page.goto('/sources/actions');
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});

  await expect(page.getByText(/All catalog capabilities as actions/i)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/35 capabilities/i)).toBeVisible({ timeout: 60_000 });
  for (const area of ['Explore', 'Object intelligence', 'Smart panel', 'Data products', 'KPI registry', 'Operations']) {
    await expect(page.getByText(area, { exact: true }).first()).toBeVisible();
  }
  const runBtns = page.getByRole('button', { name: 'Run', exact: true });
  await runBtns.first().click();
  await expect(page.locator('pre').first()).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: 'e2e/results/catalog-actions-surface.png', fullPage: true });
  expect(errs, 'zero pageerrors').toEqual([]);
});

test('connect actions page renders the catalog and runs a read-only action', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 150)));
  await signIn(page);
  await page.goto('/data-source-connection/actions');
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});

  await expect(page.getByText(/All ingestion capabilities as actions/i)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/50 capabilities/i)).toBeVisible({ timeout: 60_000 });
  for (const area of ['Discover & wizard', 'Stages & files', 'Cloud storage', 'Lakehouse']) {
    await expect(page.getByText(area, { exact: true }).first()).toBeVisible();
  }
  const runBtns = page.getByRole('button', { name: 'Run', exact: true });
  await runBtns.first().click();
  await expect(page.locator('pre').first()).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: 'e2e/results/connect-actions-surface.png', fullPage: true });
  expect(errs, 'zero pageerrors').toEqual([]);
});
