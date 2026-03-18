import { test, expect } from '@playwright/test';
import { goToPage, apiGet, apiGetRaw, apiPostRaw, expectNoRuntimeError } from './helpers';

test.describe('Data Analyst — BI & Intelligence Test', () => {
  test('1. BI Dashboard page loads', async ({ page }) => {
    await goToPage(page, '/bi-dashboard');
    await expectNoRuntimeError(page);
  });

  test('2. API: Retail KPIs endpoint works', async ({ page }) => {
    await goToPage(page, '/bi-dashboard');
    const r = await apiGetRaw(page, '/api/v1/bi-dashboard/retail-kpis');
    expect(r.status()).toBeLessThan(503);
  });

  test('3. API: Chart data from FACT_TRANSACTIONS', async ({ page }) => {
    await goToPage(page, '/bi-dashboard');
    const r = await apiPostRaw(page, '/api/v1/bi-dashboard/charts/data', {
      table: "FACT_TRANSACTIONS",
      database: "CP_DATA360",
      schema: "RETAIL_DW",
      measures: [{"column": "MONTANT_TOTAL", "aggregation": "SUM", "alias": "revenue"}],
      x: "COD_MAGASIN",
      group_by: "COD_MAGASIN",
      limit: 10
    });
    expect(r.status()).toBeLessThan(503);
  });

  test('4. Intelligence page loads with KPIs', async ({ page }) => {
    await goToPage(page, '/intelligent');
    await expectNoRuntimeError(page);
    const d = await apiGet(page, '/cortex/kpis');
    expect(d).toBeTruthy();
  });

  test('5. API: Cortex capabilities', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const d = await apiGet(page, '/cortex/capabilities');
    expect(d).toBeTruthy();
  });

  test('6. API: Semantic models list', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const r = await apiGetRaw(page, '/cortex/semantic-models/list');
    expect(r.status()).toBeLessThan(503);
  });

  test('7. API: Query analytics summary', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const r = await apiGetRaw(page, '/cortex/query-analytics/summary');
    expect(r.status()).toBeLessThan(503);
  });

  test('8. Data Quality page loads', async ({ page }) => {
    await goToPage(page, '/data-quality');
    await expectNoRuntimeError(page);
  });

  test('9. API: Quality summary', async ({ page }) => {
    await goToPage(page, '/data-quality');
    const d = await apiGet(page, '/data-quality/quality-summary');
    expect(d).toBeTruthy();
  });

  test('10. API: Completeness metrics', async ({ page }) => {
    await goToPage(page, '/data-quality');
    const d = await apiGet(page, '/data-quality/completeness-metrics');
    expect(d).toBeTruthy();
  });
});
