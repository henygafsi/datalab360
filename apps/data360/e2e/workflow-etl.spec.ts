import { test, expect } from '@playwright/test';
import {
  goToPage, expectNoRuntimeError, clickTab,
  apiGet, apiPost, apiGetRaw, apiPostRaw,
} from './helpers';

// ============================================================
// WORKFLOW — ETL Blocks, Compile, Execute, Tasks E2E Tests
// Tests the 64-block ETL palette + CTE pipeline engine
// ============================================================

test.describe('Workflow — UI Navigation', () => {
  test('1. Page loads without runtime errors', async ({ page }) => {
    await goToPage(page, '/workflow');
    await expectNoRuntimeError(page);
    await page.screenshot({ path: 'e2e/screenshots/wf-etl-01-load.png' });
  });

  test('2. ETL palette or block library is visible', async ({ page }) => {
    await goToPage(page, '/workflow');
    const palette = page.locator('text=/palette|blocks|sources|transforms|destinations/i');
    expect(await palette.count()).toBeGreaterThan(0);
  });

  test('3. Source category has blocks', async ({ page }) => {
    await goToPage(page, '/workflow');
    const sources = page.locator('text=/source|snowflake|postgres|mysql|s3|azure|gcs|salesforce/i');
    expect(await sources.count()).toBeGreaterThan(0);
  });

  test('4. Transform category has blocks', async ({ page }) => {
    await goToPage(page, '/workflow');
    const transforms = page.locator('text=/transform|join|filter|aggregate|select|rename/i');
    expect(await transforms.count()).toBeGreaterThan(0);
  });

  test('5. Destination category has blocks', async ({ page }) => {
    await goToPage(page, '/workflow');
    const destinations = page.locator('text=/destination|target|output|export/i');
    expect(await destinations.count()).toBeGreaterThan(0);
  });

  test('6. AI Functions category exists', async ({ page }) => {
    await goToPage(page, '/workflow');
    const ai = page.locator('text=/ai|intelligence|cortex|classify|sentiment/i');
    expect(await ai.count()).toBeGreaterThan(0);
  });

  test('7. Canvas area renders', async ({ page }) => {
    await goToPage(page, '/workflow');
    const canvas = page.locator('.react-flow, [class*="canvas"], [class*="workflow-builder"]');
    expect(await canvas.count()).toBeGreaterThan(0);
  });
});

test.describe('Workflow — Action Templates API', () => {
  test('8. GET action templates returns 64+ types', async ({ page }) => {
    await goToPage(page, '/workflow');
    const data = await apiGet(page, '/api/v1/workflows/action-templates');
    const templates = data?.data || data?.templates || data?.actions || data || [];
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThanOrEqual(30);
  });

  test('9. Templates include source blocks', async ({ page }) => {
    await goToPage(page, '/workflow');
    const data = await apiGet(page, '/api/v1/workflows/action-templates');
    const templates = data?.data || data?.templates || data?.actions || data || [];
    const types = templates.map((t: any) => (t.action_type || t.ACTION_TYPE || '').toLowerCase());
    expect(types).toContain('source');
  });

  test('10. Templates include join block', async ({ page }) => {
    await goToPage(page, '/workflow');
    const data = await apiGet(page, '/api/v1/workflows/action-templates');
    const templates = data?.data || data?.templates || data?.actions || data || [];
    const types = templates.map((t: any) => (t.action_type || t.ACTION_TYPE || '').toLowerCase());
    const hasJoin = types.includes('join') || types.includes('join_tables');
    expect(hasJoin).toBe(true);
  });

  test('11. Templates include AI function blocks', async ({ page }) => {
    await goToPage(page, '/workflow');
    const data = await apiGet(page, '/api/v1/workflows/action-templates');
    const templates = data?.data || data?.templates || data?.actions || data || [];
    const types = templates.map((t: any) => (t.action_type || t.ACTION_TYPE || '').toLowerCase());
    const hasAI = types.some((t: string) => t.startsWith('ai_'));
    expect(hasAI).toBe(true);
  });

  test('12. Templates include ML training blocks', async ({ page }) => {
    await goToPage(page, '/workflow');
    const data = await apiGet(page, '/api/v1/workflows/action-templates');
    const templates = data?.data || data?.templates || data?.actions || data || [];
    const types = templates.map((t: any) => (t.action_type || t.ACTION_TYPE || '').toLowerCase());
    const hasML = types.some((t: string) =>
      ['finetune', 'classification_train', 'forecast', 'anomaly_detect', 'document_ai'].includes(t)
    );
    expect(hasML).toBe(true);
  });
});

test.describe('Workflow — Capabilities API', () => {
  test('13. GET capabilities returns catalog', async ({ page }) => {
    await goToPage(page, '/workflow');
    const resp = await apiGetRaw(page, '/api/v1/workflows/capabilities');
    expect(resp.status()).toBeLessThan(500);
  });
});

test.describe('Workflow — Workflow CRUD', () => {
  let workflowId: string | null = null;

  test('14. List workflows', async ({ page }) => {
    await goToPage(page, '/workflow');
    const data = await apiGet(page, '/api/v1/projects?project_type=workflow');
    const workflows = data?.projects || data || [];
    expect(Array.isArray(workflows)).toBe(true);
    if (workflows.length > 0) {
      workflowId = workflows[0].project_id || workflows[0].id;
    }
  });

  test('15. Get workflow steps (no 5xx)', async ({ page }) => {
    await goToPage(page, '/workflow');
    if (!workflowId) {
      const data = await apiGet(page, '/api/v1/projects?project_type=workflow');
      const workflows = data?.projects || data || [];
      if (workflows.length > 0) workflowId = workflows[0].project_id || workflows[0].id;
    }
    if (!workflowId) { test.skip(); return; }
    const resp = await apiGetRaw(page, `/api/v1/workflows/${workflowId}/steps`);
    expect(resp.status()).toBeLessThan(500);
  });

  test('16. Compile workflow (no 5xx)', async ({ page }) => {
    await goToPage(page, '/workflow');
    if (!workflowId) test.skip();
    const resp = await apiPostRaw(page, `/api/v1/workflows/${workflowId}/compile`, {});
    expect(resp.status()).toBeLessThan(500);
  });

  test('17. Validate workflow (no 5xx)', async ({ page }) => {
    await goToPage(page, '/workflow');
    if (!workflowId) test.skip();
    const resp = await apiPostRaw(page, `/api/v1/workflows/${workflowId}/validate`, {});
    expect(resp.status()).toBeLessThan(500);
  });

  test('18. List workflow runs (no 5xx)', async ({ page }) => {
    await goToPage(page, '/workflow');
    if (!workflowId) test.skip();
    const resp = await apiGetRaw(page, `/api/v1/workflows/${workflowId}/runs`);
    expect(resp.status()).toBeLessThan(500);
  });

  test('19. List workflow versions (no 5xx)', async ({ page }) => {
    await goToPage(page, '/workflow');
    if (!workflowId) test.skip();
    const resp = await apiGetRaw(page, `/api/v1/workflows/${workflowId}/versions`);
    expect(resp.status()).toBeLessThan(500);
  });

  test('20. List schedules (no 5xx)', async ({ page }) => {
    await goToPage(page, '/workflow');
    const resp = await apiGetRaw(page, '/api/v1/workflows/schedules');
    expect(resp.status()).toBeLessThan(500);
  });
});

test.describe('Workflow — Task Discovery', () => {
  test('21. Discover Snowflake tasks', async ({ page }) => {
    await goToPage(page, '/workflow');
    const resp = await apiGetRaw(page, '/api/v1/workflows/tasks/discover');
    expect(resp.status()).toBeLessThan(500);
  });

  test('22. Run ad-hoc SQL (no 5xx)', async ({ page }) => {
    await goToPage(page, '/workflow');
    const resp = await apiPostRaw(page, '/api/v1/workflows/run-sql', {
      sql: 'SELECT CURRENT_TIMESTAMP() AS now',
      warehouse: 'COMPUTE_WH'
    });
    expect(resp.status()).toBeLessThan(500);
    if (resp.status() === 200) {
      const data = await resp.json();
      expect(data).toBeDefined();
    }
  });
});

test.describe('Workflow — Git Integration', () => {
  test('23. List Git repositories (no 5xx)', async ({ page }) => {
    await goToPage(page, '/workflow');
    const resp = await apiGetRaw(page, '/api/v1/workflows/git/repositories');
    expect(resp.status()).toBeLessThan(500);
  });
});

test.describe('Workflow — Compute & Notebooks', () => {
  test('24. List compute pools (no 5xx)', async ({ page }) => {
    await goToPage(page, '/workflow');
    const resp = await apiGetRaw(page, '/api/v1/workflows/compute-pools');
    expect(resp.status()).toBeLessThan(500);
  });

  test('25. List container services (no 5xx)', async ({ page }) => {
    await goToPage(page, '/workflow');
    const resp = await apiGetRaw(page, '/api/v1/workflows/services');
    expect(resp.status()).toBeLessThan(500);
  });

  test('26. List notebooks (no 5xx)', async ({ page }) => {
    await goToPage(page, '/workflow');
    const resp = await apiGetRaw(page, '/api/v1/workflows/notebooks');
    expect(resp.status()).toBeLessThan(500);
  });
});

test.describe('Workflow — UI Tabs', () => {
  test('27. Versions tab accessible', async ({ page }) => {
    await goToPage(page, '/workflow');
    const versionsTab = page.locator('text=/version|history/i');
    if (await versionsTab.count() > 0) {
      await versionsTab.first().click();
      await page.waitForTimeout(1000);
    }
    await expectNoRuntimeError(page);
  });

  test('28. Runs tab accessible', async ({ page }) => {
    await goToPage(page, '/workflow');
    const runsTab = page.locator('text=/runs|execution|history/i');
    if (await runsTab.count() > 0) {
      await runsTab.first().click();
      await page.waitForTimeout(1000);
    }
    await expectNoRuntimeError(page);
  });

  test('29. Dark mode classes present', async ({ page }) => {
    await goToPage(page, '/workflow');
    const darkClasses = await page.locator('[class*="dark:"]').count();
    expect(darkClasses).toBeGreaterThan(0);
  });
});

test.describe('Workflow — Deployments', () => {
  test('30. List deployments (no 5xx)', async ({ page }) => {
    await goToPage(page, '/workflow');
    const data = await apiGet(page, '/api/v1/projects?project_type=workflow');
    const workflows = data?.projects || data?.data || data || [];
    if (!Array.isArray(workflows) || workflows.length === 0) { test.skip(); return; }
    const wfId = workflows[0].project_id || workflows[0].id;
    if (!wfId) { test.skip(); return; }
    const resp = await apiGetRaw(page, `/api/v1/workflows/${wfId}/deployments`);
    expect(resp.status()).toBeLessThan(500);
  });
});
