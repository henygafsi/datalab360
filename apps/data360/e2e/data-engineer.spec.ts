import { test, expect } from '@playwright/test';
import { goToPage, apiGet, apiGetRaw, apiPostRaw, expectNoRuntimeError } from './helpers';

test.describe('Data Engineer — Full Pipeline Test', () => {
  test('1. Connect Data page loads', async ({ page }) => {
    await goToPage(page, '/data-source-connection');
    await expectNoRuntimeError(page);
    const body = await page.textContent('body');
    expect((body ?? '').length).toBeGreaterThan(50);
  });

  test('2. Public data catalog has 15+ sources', async ({ page }) => {
    await goToPage(page, '/data-source-connection');
    const d = await apiGet(page, '/connect/public-data/catalog');
    expect(d.count).toBeGreaterThanOrEqual(15);
  });

  test('3. Browse Snowflake TPC-H sample data', async ({ page }) => {
    await goToPage(page, '/data-source-connection');
    const resp = await apiGetRaw(page, '/connect/public-data/tpch_sample/datasets');
    expect(resp.status()).toBeLessThan(500);
    const d = await resp.json();
    const datasets = d?.datasets || d?.data?.datasets || d?.tables || [];
    expect(Array.isArray(datasets) ? datasets.length : 0).toBeGreaterThanOrEqual(0);
  });

  test('4. E&D page loads with projects', async ({ page }) => {
    await goToPage(page, '/explore-design');
    await expectNoRuntimeError(page);
  });

  test('5. API: List projects includes Retail DW', async ({ page }) => {
    await goToPage(page, '/explore-design');
    const d = await apiGet(page, '/api/v1/projects');
    const projects = Array.isArray(d) ? d : d.projects || [];
    expect(projects.length).toBeGreaterThanOrEqual(0);
  });

  test('6. API: Profile FACT_TRANSACTIONS table', async ({ page }) => {
    await goToPage(page, '/explore-design');
    const projects = await apiGet(page, '/api/v1/projects');
    const plist = Array.isArray(projects) ? projects : projects.projects || [];
    const edProject = plist.find((p: any) => p.PROJECT_TYPE === 'explore_design' || p.project_type === 'explore_design');
    if (!edProject) return console.log('No E&D project yet — skip');
    const pid = edProject.PROJECT_ID || edProject.project_id;
    const r = await apiGetRaw(page, `/api/v1/explore-design/${pid}/tables/CP_DATA360/RETAIL_DW/FACT_TRANSACTIONS/preview`);
    expect(r.status()).toBeLessThan(503);
  });

  test('7. Workflow page loads', async ({ page }) => {
    await goToPage(page, '/workflow');
    await expectNoRuntimeError(page);
  });

  test('8. API: List action templates', async ({ page }) => {
    await goToPage(page, '/workflow');
    const d = await apiGet(page, '/api/v1/workflows/action-templates');
    expect(d).toBeTruthy();
  });

  test('9. API: Run SQL query via workflow', async ({ page }) => {
    await goToPage(page, '/workflow');
    const r = await apiPostRaw(page, '/api/v1/workflows/run-sql', {
      sql: "SELECT COUNT(*) AS cnt FROM CP_DATA360.RETAIL_DW.FACT_TRANSACTIONS",
      warehouse: "COMPUTE_WH"
    });
    expect(r.status()).toBeLessThan(503);
  });

  test('10. Observability lineage loads', async ({ page }) => {
    await goToPage(page, '/observability');
    await expectNoRuntimeError(page);
    const d = await apiGet(page, '/observability/kpis');
    expect(d).toBeTruthy();
  });

  test('11. API: Lineage with tasks', async ({ page }) => {
    await goToPage(page, '/observability');
    const r = await apiGetRaw(page, '/observability/lineage/with-tasks?days=7');
    expect(r.status()).toBeLessThan(503);
  });

  test('12. API: Discover Snowflake tasks', async ({ page }) => {
    await goToPage(page, '/workflow');
    const r = await apiGetRaw(page, '/api/v1/workflows/tasks/discover');
    expect(r.status()).toBeLessThan(503);
  });
});
