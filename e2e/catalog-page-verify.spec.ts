import { test, expect } from '@playwright/test';

/**
 * Live verification for the /explore-design/catalog master console:
 *  - viewport-fit: the page root fits the viewport (inner regions scroll)
 *  - per-axis summary strip (6 cards from the real /catalog/scores rollup)
 *  - master TABLE view by default — real rows, no blank names, row click
 *    opens the docked drill-in drawer
 *  - same-page tab switching (no reload)
 *  - canvas stays available as the alternate view and paints custom nodes
 */
const USER = process.env.D360_USER ?? 'HAHA';
const PASS = process.env.D360_PASS ?? '';
const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-HAHA';

test.setTimeout(10 * 60_000);

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill(ACCOUNT).catch(() => {});
  await page.locator('input[name="username"], input#username').first().fill(USER).catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });
}

test('catalog master console: axis cards, master table, drawer, tabs, canvas', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));

  await signIn(page);
  await page.goto('/explore-design/catalog');
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  expect(await page.getByText('Something went wrong', { exact: false }).isVisible().catch(() => false)).toBe(false);

  // ── Per-axis summary strip: all 6 axis cards present ──
  const strip = page.locator('section[aria-label="Catalog score highlights"]');
  await expect(strip).toBeVisible({ timeout: 30_000 });
  for (const axis of ['Quality', 'Governance', 'Modeling', 'FinOps', 'ML ready', 'Trust']) {
    await expect(strip.getByText(axis, { exact: true })).toBeVisible();
  }

  // ── Viewport-fit: the catalog root box fits inside the viewport ──
  const rootBox = await page.locator('div.flex.flex-col.overflow-hidden').first().boundingBox();
  const viewport = page.viewportSize();
  expect(rootBox, 'catalog root should render').not.toBeNull();
  if (rootBox && viewport) {
    expect(rootBox.height, 'page root must fit the viewport (no page scroll)').toBeLessThanOrEqual(viewport.height);
  }

  // ── Master TABLE view is the default: rows render, no blank names ──
  const rows = page.locator('tbody tr[aria-selected]');
  await expect.poll(async () => rows.count(), { timeout: 60_000, intervals: [2000] }).toBeGreaterThan(0);
  const rowCount = await rows.count();
  const firstName = (await rows.first().locator('td').first().innerText()).trim();
  console.log(`TABLE rows=${rowCount} firstName="${firstName}"`);
  expect(firstName.length, 'first object name must not be blank').toBeGreaterThan(0);
  await page.screenshot({ path: 'e2e/results/catalog-master-table.png', fullPage: false });

  // ── Row click → docked drill-in drawer ──
  await rows.first().click();
  await expect(page.locator('aside, [class*="w-80"]').first()).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: 'e2e/results/catalog-drawer-drill.png', fullPage: false });

  // ── Same-page tab switch: marker survives (no navigation/reload) ──
  await page.evaluate(() => { (window as any).__no_reload_marker = 1; });
  for (const label of ['Sources', 'Products', 'All']) {
    await page.getByRole('tab', { name: new RegExp(`^${label}`) }).click();
    await expect(page.getByRole('tab', { name: new RegExp(`^${label}`) })).toHaveAttribute('aria-selected', 'true');
  }
  expect(await page.evaluate(() => (window as any).__no_reload_marker)).toBe(1);
  expect(page.url()).toContain('tab=all');

  // ── Canvas stays available as the alternate view and paints nodes ──
  await page.getByRole('group', { name: 'Center view' }).getByRole('button', { name: /canvas/i }).click();
  const canvasNodes = page.locator('.react-flow__node');
  await expect.poll(async () => canvasNodes.count(), { timeout: 120_000, intervals: [3000] }).toBeGreaterThan(0);
  console.log(`CANVAS nodes=${await canvasNodes.count()}`);
  await page.screenshot({ path: 'e2e/results/catalog-canvas-view.png', fullPage: false });

  expect(pageErrors, `pageErrors: ${pageErrors.join(' | ')}`).toEqual([]);
});
