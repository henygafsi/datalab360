import { test, expect } from '@playwright/test';

/**
 * Connect Data — rich-CTA consolidation gate.
 * Verifies the unified InsightActionButton surfaces (right cockpit grouped by
 * intent: Connect / Ingest / Verify / Govern, health-strip Test/Sync, Quick
 * Access add-connection) render authenticated with no error boundary and zero
 * pageerrors. Screenshot: e2e/results/connect-data-ctas.png
 */
const PASS = process.env.D360_PASS ?? '';
test.setTimeout(8 * 60_000);

test('connect-data page renders unified rich CTAs without errors', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  // --- Sign in (same flow as the other e2e specs) ---
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });

  // --- Load the Connect Data page ---
  await page.goto('/data-source-connection');
  await page.waitForLoadState('networkidle', { timeout: 90_000 }).catch(() => {});

  // No error boundary anywhere on the page.
  await expect(page.getByText('Something went wrong')).toHaveCount(0);

  // Header + data-first render: the page heading and KPI strip must land.
  await expect(
    page.getByRole('heading', { name: 'Data Source Connection' }),
  ).toBeVisible({ timeout: 60_000 });

  // --- Cockpit rail: exercise every axis (the page's state-based "tabs") ---
  const rail = page.locator('nav[aria-label="Module axes"]');
  await expect(rail).toBeVisible({ timeout: 30_000 });

  // Sources axis auto-opens; its Connect group carries the rich Add-connection CTA.
  const sourcesPanel = page.locator('section[aria-label="Sources panel"]');
  await expect(sourcesPanel).toBeVisible({ timeout: 30_000 });
  await expect(sourcesPanel.getByText('Add connection').first()).toBeVisible();
  await expect(sourcesPanel.getByText('Connect').first()).toBeVisible();

  // Remaining axes: click each rail entry, assert its panel + intent content.
  const axes: Array<{ title: string; panel: string; expectText: RegExp }> = [
    {
      title: 'Ingestion',
      panel: 'Ingestion panel',
      expectText: /Sync |Test |No registered connectors|Nothing to probe/,
    },
    {
      title: 'Governance',
      panel: 'Governance panel',
      expectText: /Re-check stage grants/,
    },
    { title: 'Cost', panel: 'Cost panel', expectText: /credits|No cost feed/i },
    { title: 'History', panel: 'History panel', expectText: /Recent activity/ },
    { title: 'AI helper', panel: 'AI helper panel', expectText: /AI connector helper/ },
  ];
  for (const a of axes) {
    await rail.locator(`button[title="${a.title}"]`).click();
    const panel = page.locator(`section[aria-label="${a.panel}"]`);
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByText(a.expectText).first()).toBeVisible({ timeout: 30_000 });
  }

  // Verify intent group present in the Ingestion axis (Ingest + Verify sections).
  await rail.locator('button[title="Ingestion"]').click();
  const ingestionPanel = page.locator('section[aria-label="Ingestion panel"]');
  await expect(ingestionPanel).toBeVisible({ timeout: 15_000 });
  await expect(ingestionPanel.getByText('Ingest', { exact: true })).toBeVisible();
  await expect(ingestionPanel.getByText('Verify', { exact: true })).toBeVisible();

  // Back to Sources for the screenshot (canonical cockpit view).
  await rail.locator('button[title="Sources"]').click();
  await expect(sourcesPanel).toBeVisible({ timeout: 15_000 });

  // Give the health strip / stage list a moment to settle, then capture.
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'e2e/results/connect-data-ctas.png', fullPage: false });

  expect(pageErrors, `pageerrors:\n${pageErrors.join('\n')}`).toHaveLength(0);
});
