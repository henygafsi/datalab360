import { test, expect } from '@playwright/test';
import {
  goToPage, expectNoRuntimeError, clickTab,
  apiGet, apiPost, apiGetRaw, apiPostRaw, apiPut,
} from './helpers';

// ============================================================
// EXPLORE & DESIGN — Deployment Pipeline + AI Advisor E2E Tests
// Tests the full 10-phase E&D algorithm via API + UI
// ============================================================

let projectId: string | null = null;

test.describe('E&D — UI Navigation', () => {
  test('1. Page loads without runtime errors', async ({ page }) => {
    await goToPage(page, '/explore-design');
    await expectNoRuntimeError(page);
    await page.screenshot({ path: 'e2e/screenshots/ed-deploy-01-load.png' });
  });

  test('2. Project selector or content is visible', async ({ page }) => {
    await goToPage(page, '/explore-design');
    const body = await page.textContent('body') ?? '';
    const hasContent = /project|catalog|modeling|explore|design|source|table/i.test(body);
    expect(hasContent).toBe(true);
  });

  test('3. Catalog and Modeling view toggles exist', async ({ page }) => {
    await goToPage(page, '/explore-design');
    const body = await page.textContent('body') ?? '';
    const hasCatalog = /catalog/i.test(body);
    const hasModeling = /modeling/i.test(body);
    expect(hasCatalog || hasModeling).toBe(true);
  });

  test('4. Deployment or Changes tab is visible', async ({ page }) => {
    await goToPage(page, '/explore-design');
    const body = await page.textContent('body') ?? '';
    const hasDeploy = /deploy|changes|version|history/i.test(body);
    expect(hasDeploy).toBe(true);
  });
});

test.describe('E&D — Projects API', () => {
  test('5. List projects via API', async ({ page }) => {
    await goToPage(page, '/explore-design');
    const data = await apiGet(page, '/api/v1/projects?project_type=explore_design');
    expect(Array.isArray(data?.projects || data)).toBe(true);
    // Store first project ID for later tests
    const projects = data?.projects || data || [];
    if (projects.length > 0) {
      projectId = projects[0].project_id || projects[0].id;
    }
  });

  test('6. Get project details', async ({ page }) => {
    await goToPage(page, '/explore-design');
    if (!projectId) {
      const data = await apiGet(page, '/api/v1/projects?project_type=explore_design');
      const projects = data?.projects || data || [];
      projectId = projects[0]?.project_id || projects[0]?.id;
    }
    if (!projectId) { test.skip(); return; }
    const resp = await apiGetRaw(page, `/api/v1/explore-design/${projectId}/ddl-actions`);
    expect(resp.status()).toBeLessThan(500);
  });
});

test.describe('E&D — Deployment Pipeline API', () => {
  test('7. List DDL actions', async ({ page }) => {
    await goToPage(page, '/explore-design');
    if (!projectId) test.skip();
    const data = await apiGet(page, `/api/v1/explore-design/${projectId}/ddl-actions`);
    expect(data).toBeDefined();
  });

  test('8. Pre-check deployment (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    if (!projectId) test.skip();
    const resp = await apiPostRaw(page, `/api/v1/explore-design/${projectId}/ddl-actions/dry-run`, {
      database: 'CP_DATA360', schema: 'RETAIL_DW', actions: []
    });
    expect(resp.status()).toBeLessThan(500);
  });

  test('9. Dry-run deployment (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    if (!projectId) test.skip();
    const resp = await apiPostRaw(page, `/api/v1/explore-design/${projectId}/dry-run`, {
      warehouse: 'COMPUTE_WH', sample_rows: 5
    });
    expect(resp.status()).toBeLessThan(500);
  });

  test('10. Post-verify deployment (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    if (!projectId) test.skip();
    const resp = await apiPostRaw(page, `/api/v1/explore-design/${projectId}/post-verify`, {
      database: 'CP_DATA360', schema: 'RETAIL_DW'
    });
    expect(resp.status()).toBeLessThan(500);
  });

  test('11. Impact analysis (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    if (!projectId) test.skip();
    const resp = await apiPostRaw(page, `/api/v1/explore-design/${projectId}/impact-analysis`, {
      database: 'CP_DATA360', schema: 'RETAIL_DW', table: 'FACT_TRANSACTIONS'
    });
    expect(resp.status()).toBeLessThan(500);
  });

  test('12. Conflict check (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    if (!projectId) test.skip();
    const resp = await apiPostRaw(page, `/api/v1/explore-design/${projectId}/conflict-check`, {});
    expect(resp.status()).toBeLessThan(500);
  });

  test('13. Quality gates run (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    if (!projectId) test.skip();
    const resp = await apiPostRaw(page, `/api/v1/explore-design/${projectId}/quality-gates/run`, {
      database: 'CP_DATA360', schema: 'RETAIL_DW', table: 'FACT_TRANSACTIONS',
      gates: [{ column: 'TRANSACTION_ID', check_type: 'null_rate', threshold: 0.1, severity: 'WARNING' }]
    });
    expect(resp.status()).toBeLessThan(500);
  });

  test('14. Ingestion runs list (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    if (!projectId) test.skip();
    const resp = await apiGetRaw(page, `/api/v1/explore-design/${projectId}/ingestion/runs?limit=5`);
    expect(resp.status()).toBeLessThan(500);
  });

  test('15. List versions (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    if (!projectId) test.skip();
    const resp = await apiGetRaw(page, `/api/v1/explore-design/${projectId}/versions`);
    expect(resp.status()).toBeLessThan(500);
  });
});

test.describe('E&D — AI Advisor API', () => {
  test('16. AI column classification (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    if (!projectId) test.skip();
    const resp = await apiGetRaw(page,
      `/api/v1/explore-design/${projectId}/tables/CP_DATA360/RETAIL_DW/FACT_TRANSACTIONS/ai/column-classification`
    );
    expect(resp.status()).toBeLessThan(500);
  });

  test('17. AI discover relationships (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    if (!projectId) test.skip();
    const resp = await apiPostRaw(page, `/api/v1/explore-design/${projectId}/ai/discover-relationships`, {
      tables: [
        { database: 'CP_DATA360', schema: 'RETAIL_DW', name: 'FACT_TRANSACTIONS' },
        { database: 'CP_DATA360', schema: 'RETAIL_DW', name: 'DIM_CLIENTS' }
      ]
    });
    expect(resp.status()).toBeLessThan(500);
  });

  test('18. AI schema health (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    if (!projectId) test.skip();
    const resp = await apiGetRaw(page, `/api/v1/explore-design/${projectId}/ai/schema-health`);
    expect(resp.status()).toBeLessThan(500);
  });

  test('19. AI deployment risk score (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    if (!projectId) test.skip();
    const resp = await apiPostRaw(page, `/api/v1/explore-design/${projectId}/ai/deployment-risk`, {
      pending_events: []
    });
    expect(resp.status()).toBeLessThan(500);
  });

  test('20. AI type optimization (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    if (!projectId) test.skip();
    const resp = await apiGetRaw(page,
      `/api/v1/explore-design/${projectId}/tables/CP_DATA360/RETAIL_DW/FACT_TRANSACTIONS/ai/type-optimization`
    );
    expect(resp.status()).toBeLessThan(500);
  });

  test('21. AI SCD recommendation (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    if (!projectId) test.skip();
    const resp = await apiGetRaw(page,
      `/api/v1/explore-design/${projectId}/tables/CP_DATA360/RETAIL_DW/FACT_TRANSACTIONS/ai/scd-recommendation`
    );
    expect(resp.status()).toBeLessThan(500);
  });

  test('22. AI ingestion recommendation (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    if (!projectId) test.skip();
    const resp = await apiGetRaw(page,
      `/api/v1/explore-design/${projectId}/tables/CP_DATA360/RETAIL_DW/FACT_TRANSACTIONS/ai/ingestion-recommendation`
    );
    expect(resp.status()).toBeLessThan(500);
  });
});

test.describe('E&D — AI Recommendation Registry', () => {
  test('23. List recommendations (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    const resp = await apiGetRaw(page, '/api/v1/explore-design/ai/recommendations');
    expect(resp.status()).toBeLessThan(500);
  });

  test('24. Recommendation stats (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    const resp = await apiGetRaw(page, '/api/v1/explore-design/ai/recommendations/stats');
    expect(resp.status()).toBeLessThan(500);
    const data = await resp.json();
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('acceptance_rate');
  });

  test('25. AI describe deployment (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    if (!projectId) test.skip();
    const resp = await apiPostRaw(page, `/api/v1/explore-design/${projectId}/ai/describe-deployment`, {});
    expect(resp.status()).toBeLessThan(500);
  });

  test('26. AI best practices check (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    if (!projectId) test.skip();
    const resp = await apiPostRaw(page, `/api/v1/explore-design/${projectId}/ai/deployment-best-practices`, {});
    expect(resp.status()).toBeLessThan(500);
  });
});

test.describe('E&D — Infrastructure Objects API', () => {
  test('27. List dynamic tables (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    const resp = await apiGetRaw(page, '/api/v1/explore-design/dynamic-tables');
    expect(resp.status()).toBeLessThan(500);
  });

  test('28. List streams (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    const resp = await apiGetRaw(page, '/api/v1/explore-design/streams');
    expect(resp.status()).toBeLessThan(500);
  });

  test('29. List alerts (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    const resp = await apiGetRaw(page, '/api/v1/explore-design/alerts');
    expect(resp.status()).toBeLessThan(500);
  });

  test('30. List event tables (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    const resp = await apiGetRaw(page, '/api/v1/explore-design/event-tables');
    expect(resp.status()).toBeLessThan(500);
  });

  test('31. List hybrid tables (no 5xx)', async ({ page }) => {
    await goToPage(page, '/explore-design');
    const resp = await apiGetRaw(page, '/api/v1/explore-design/hybrid-tables');
    expect(resp.status()).toBeLessThan(500);
  });
});

test.describe('E&D — Dark Mode', () => {
  test('32. Dark mode classes present on E&D page', async ({ page }) => {
    await goToPage(page, '/explore-design');
    const darkClasses = await page.locator('[class*="dark:"]').count();
    expect(darkClasses).toBeGreaterThan(0);
  });
});
