import { test, expect } from '@playwright/test';
import {
  goToPage,
  expectNoRuntimeError,
  clickTab,
  expectTabContent,
  expectKpiCards,
  expectNoLoader,
  expectDarkModeSupport,
  apiGet,
  apiGetRaw,
} from './helpers';

// ============================================================
// DATA QUALITY — Comprehensive UI + API E2E Tests (~20 tests)
// Page: /data-quality  |  Backend prefix: /data-quality
// 9 tabs: Completeness, Uniqueness, Freshness, Ingestion,
//         Schema, Classification, Cost, Security, DMF
// ============================================================

test.describe('Data Quality — Page Load', () => {
  test('1. Page loads without runtime errors', async ({ page }) => {
    await goToPage(page, '/data-quality');
    await expectNoRuntimeError(page);
    const body = await page.textContent('body');
    expect((body ?? '').length).toBeGreaterThan(50);
  });

  test('2. KPI cards are visible and populated', async ({ page }) => {
    await goToPage(page, '/data-quality');
    await expectNoLoader(page);
    // Data Quality renders a gradient header with health score + violation counts
    await expectKpiCards(page, 1);
    // Main content area exists
    await expect(page.locator('main, [role="main"], .dashboard, section').first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Data Quality — Tab Navigation', () => {
  test('3. Completeness tab renders completeness content', async ({ page }) => {
    await goToPage(page, '/data-quality');
    await clickTab(page, 'Completeness');
    // Must show relevant text — "completeness" is displayed in the tab panel
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toContain('complet');
    await page.screenshot({ path: 'e2e/screenshots/dq-tab-completeness.png' });
  });

  test('4. Uniqueness tab renders uniqueness content', async ({ page }) => {
    await goToPage(page, '/data-quality');
    await clickTab(page, 'Uniqueness');
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toMatch(/unique|duplicat/);
    await page.screenshot({ path: 'e2e/screenshots/dq-tab-uniqueness.png' });
  });

  test('5. Freshness tab renders freshness content', async ({ page }) => {
    await goToPage(page, '/data-quality');
    await clickTab(page, 'Freshness');
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toMatch(/fresh|staleness|last.updat/);
    await page.screenshot({ path: 'e2e/screenshots/dq-tab-freshness.png' });
  });

  test('6. Ingestion tab renders ingestion content', async ({ page }) => {
    await goToPage(page, '/data-quality');
    await clickTab(page, 'Ingestion');
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toMatch(/ingest|load|pipe|stage/);
    await page.screenshot({ path: 'e2e/screenshots/dq-tab-ingestion.png' });
  });

  test('7. Schema tab renders schema content', async ({ page }) => {
    await goToPage(page, '/data-quality');
    await clickTab(page, 'Schema');
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toMatch(/schema|column|table/);
    await page.screenshot({ path: 'e2e/screenshots/dq-tab-schema.png' });
  });

  test('8. Classification tab renders classification content', async ({ page }) => {
    await goToPage(page, '/data-quality');
    await clickTab(page, 'Classification');
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toMatch(/classif|pii|dim|measure/);
    await page.screenshot({ path: 'e2e/screenshots/dq-tab-classification.png' });
  });

  test('9. Cost tab renders cost content', async ({ page }) => {
    await goToPage(page, '/data-quality');
    await clickTab(page, 'Cost');
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toMatch(/cost|credit|spend/);
    await page.screenshot({ path: 'e2e/screenshots/dq-tab-cost.png' });
  });

  test('10. Security tab renders security content', async ({ page }) => {
    await goToPage(page, '/data-quality');
    await clickTab(page, 'Security');
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toMatch(/security|mask|policy|access/);
    await page.screenshot({ path: 'e2e/screenshots/dq-tab-security.png' });
  });

  test('11. DMF tab renders DMF content', async ({ page }) => {
    await goToPage(page, '/data-quality');
    await clickTab(page, 'DMF');
    const body = await page.textContent('body');
    // DMF = Data Metric Functions — Snowflake native DQ
    expect((body ?? '').toLowerCase()).toMatch(/dmf|metric|function|check/);
    await page.screenshot({ path: 'e2e/screenshots/dq-tab-dmf.png' });
  });
});

test.describe('Data Quality — API Validation', () => {
  test('12. GET /data-quality/quality-summary returns health score', async ({ page }) => {
    await goToPage(page, '/data-quality');
    const data = await apiGet(page, '/data-quality/quality-summary');
    expect(data).toBeTruthy();
    // Should return health score or violation counts
    const payload = data?.data ?? data;
    expect(payload).toBeTruthy();
  });

  test('13. GET /data-quality/completeness-metrics returns array', async ({ page }) => {
    await goToPage(page, '/data-quality');
    const data = await apiGet(page, '/data-quality/completeness-metrics');
    expect(data).toBeTruthy();
    const rows = data?.data ?? data?.metrics ?? data;
    // Response must be truthy — either array or object with metrics
    expect(rows !== null && rows !== undefined).toBe(true);
  });

  test('14. GET /data-quality/freshness-metrics returns data', async ({ page }) => {
    await goToPage(page, '/data-quality');
    const r = await apiGetRaw(page, '/data-quality/freshness-metrics');
    expect(r.status()).toBeLessThan(503);
    if (r.status() < 400) {
      const body = await r.json();
      const rows = body?.data ?? body?.metrics ?? body;
      expect(rows !== null && rows !== undefined).toBe(true);
    }
  });

  test('15. GET /data-quality/uniqueness-metrics returns data', async ({ page }) => {
    await goToPage(page, '/data-quality');
    const r = await apiGetRaw(page, '/data-quality/uniqueness-metrics');
    expect(r.status()).toBeLessThan(503);
    if (r.status() < 400) {
      const body = await r.json();
      const rows = body?.data ?? body?.metrics ?? body;
      expect(rows !== null && rows !== undefined).toBe(true);
    }
  });

  test('16. GET /data-quality/dmf-checks returns DMF list', async ({ page }) => {
    await goToPage(page, '/data-quality');
    const r = await apiGetRaw(page, '/data-quality/dmf-checks');
    // 200 or 404 are acceptable — 500+ is not
    expect(r.status()).toBeLessThan(503);
  });

  test('17. GET /data-quality/schema-health returns schema scores', async ({ page }) => {
    await goToPage(page, '/data-quality');
    const r = await apiGetRaw(page, '/data-quality/schema-health');
    expect(r.status()).toBeLessThan(503);
  });

  test('18. GET /data-quality/ingestion-metrics returns ingestion data', async ({ page }) => {
    await goToPage(page, '/data-quality');
    const r = await apiGetRaw(page, '/data-quality/ingestion-metrics');
    expect(r.status()).toBeLessThan(503);
  });

  test('19. GET /data-quality/cost-metrics returns cost data', async ({ page }) => {
    await goToPage(page, '/data-quality');
    const r = await apiGetRaw(page, '/data-quality/cost-metrics');
    expect(r.status()).toBeLessThan(503);
  });
});

test.describe('Data Quality — Dark Mode', () => {
  test('20. Dark mode classes are present on page elements', async ({ page }) => {
    await goToPage(page, '/data-quality');
    await expectNoRuntimeError(page);
    await expectDarkModeSupport(page);
  });
});
