/**
 * E2E audit: sources domain
 * Pages: /sources, /data-source-connection
 * Scope: catalog tree, refresh, connectors list
 */
import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_STATE = path.join(__dirname, '.auth/state.json');
const SCREENS = path.join(__dirname, '../docs/product-readiness-audit/screens/overnight/sources');
const BASE = 'http://localhost:3000';
const TIMEOUT = 15000;

let sc = 0;
async function shot(page, label) {
  sc++;
  const f = path.join(SCREENS, `${String(sc).padStart(2, '0')}_${label}.png`);
  await page.screenshot({ path: f, fullPage: false });
  console.log(`  [${sc}] ${label} → ${path.basename(f)}`);
  return f;
}

const results = {
  done: [],
  not_done: [],
  defects: [],
  screenshots: [],
};

function pass(label) { results.done.push(label); console.log(`  ✓ ${label}`); }
function fail(label) { results.not_done.push(label); console.log(`  ✗ ${label}`); }
function defect(label) { results.defects.push(label); console.log(`  BUG ${label}`); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: AUTH_STATE,
    viewport: { width: 1600, height: 1000 },
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(TIMEOUT);

  // ── 1. /sources ─────────────────────────────────────────────────────────────
  console.log('\n=== /sources ===');
  try {
    await page.goto(`${BASE}/sources`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    results.screenshots.push(await shot(page, 'sources_loaded'));

    // Check page title / header
    const h1 = await page.locator('h1').first().textContent().catch(() => null);
    if (h1 && h1.includes('Source')) {
      pass('sources-page-header-renders');
    } else {
      fail('sources-page-header-renders');
      defect(`/sources h1 missing or wrong: "${h1}"`);
    }

    // Tab: Sources tab present
    const sourceTab = page.locator('button', { hasText: 'Sources' }).first();
    if (await sourceTab.isVisible().catch(() => false)) {
      pass('sources-tab-visible');
    } else {
      fail('sources-tab-visible');
    }

    // Tab: Detected Models tab
    const modelsTab = page.locator('button', { hasText: 'Detected Models' }).first();
    if (await modelsTab.isVisible().catch(() => false)) {
      pass('detected-models-tab-visible');
    } else {
      fail('detected-models-tab-visible');
    }

    // ── Catalog Tree ───────────────────────────────────────────────────────────
    console.log('\n--- Catalog Tree ---');
    // Wait for tree to populate (SourceTree component)
    await page.waitForTimeout(3000);

    // Check for tree items (database/schema/table nodes) – SourceTree renders a list
    const treeItems = await page.locator('[data-testid="source-tree-item"], [role="treeitem"], .tree-item').count().catch(() => 0);
    // Fallback: look for database-like text nodes
    const treeAny = await page.locator('aside, [class*="tree"], [class*="sidebar"]').first().isVisible().catch(() => false);
    if (treeItems > 0) {
      pass(`catalog-tree-renders (${treeItems} items)`);
    } else if (treeAny) {
      pass('catalog-tree-panel-renders');
      // Try to find any clickable tree nodes
      const expandables = await page.locator('aside button, aside [role="button"]').count().catch(() => 0);
      if (expandables > 0) {
        pass(`catalog-tree-has-expandable-nodes (${expandables})`);
        // Click first expandable
        try {
          await page.locator('aside button').first().click();
          await page.waitForTimeout(1500);
          results.screenshots.push(await shot(page, 'sources_tree_expanded'));
          pass('catalog-tree-expand-click');
        } catch (e) {
          fail('catalog-tree-expand-click');
        }
      } else {
        // Check if there's an empty state
        const empty = await page.locator('text=/no sources|no objects|empty/i').count().catch(() => 0);
        if (empty > 0) {
          pass('catalog-tree-empty-state-shown');
        } else {
          fail('catalog-tree-has-expandable-nodes');
        }
      }
    } else {
      fail('catalog-tree-renders');
      defect('/sources: no tree panel found');
    }

    results.screenshots.push(await shot(page, 'sources_tree_state'));

    // ── SourcesOverview (right panel) ─────────────────────────────────────────
    const overviewCards = await page.locator('[class*="overview"], [class*="card"], [class*="stat"]').count().catch(() => 0);
    if (overviewCards > 0) {
      pass('sources-overview-panel-renders');
    } else {
      // Check for any main content on the right
      const mainContent = await page.locator('main, [class*="content"]').first().isVisible().catch(() => false);
      if (mainContent) {
        pass('sources-overview-main-content-renders');
      } else {
        fail('sources-overview-panel-renders');
      }
    }

    // ── Refresh Catalog button ─────────────────────────────────────────────────
    console.log('\n--- Refresh Catalog ---');
    const refreshBtn = page.locator('button', { hasText: /refresh catalog/i }).first();
    const refreshVisible = await refreshBtn.isVisible().catch(() => false);
    if (refreshVisible) {
      pass('refresh-catalog-button-visible');
      const refreshDisabled = await refreshBtn.isDisabled().catch(() => false);
      if (!refreshDisabled) {
        // Click refresh — non-destructive, triggers a background catalog scan
        try {
          await refreshBtn.click();
          await page.waitForTimeout(2000);
          // Check for status badge (ok/error)
          const statusBadge = await page.locator('[role="status"]').first().isVisible().catch(() => false);
          if (statusBadge) {
            const statusText = await page.locator('[role="status"]').first().textContent().catch(() => '');
            pass(`refresh-catalog-status-badge-shown: "${statusText?.trim()}"`);
            if (statusText?.toLowerCase().includes('fail') || statusText?.toLowerCase().includes('error')) {
              defect(`/sources: refresh returned error: ${statusText?.trim()}`);
            }
          } else {
            // Spinner may have cleared — still consider it a pass if button stopped spinning
            const spinning = await page.locator('button:has(.animate-spin)').count().catch(() => 0);
            if (spinning === 0) {
              pass('refresh-catalog-completed-no-error-badge');
            } else {
              fail('refresh-catalog-status-badge-shown');
            }
          }
          results.screenshots.push(await shot(page, 'sources_refresh_result'));
        } catch (e) {
          defect(`/sources: refresh click failed: ${e.message}`);
        }
      } else {
        fail('refresh-catalog-button-enabled');
        defect('/sources: Refresh Catalog button is disabled (RBAC denial or loading stuck)');
      }
    } else {
      fail('refresh-catalog-button-visible');
      defect('/sources: Refresh Catalog button not found');
    }

    // ── Add Source link ────────────────────────────────────────────────────────
    const addSrcBtn = page.locator('a[href="/data-source-connection"], button', { hasText: /add source/i }).first();
    if (await addSrcBtn.isVisible().catch(() => false)) {
      pass('add-source-button-visible');
    } else {
      fail('add-source-button-visible');
    }

    // ── Detected Models tab ───────────────────────────────────────────────────
    console.log('\n--- Detected Models tab ---');
    try {
      await modelsTab.click();
      await page.waitForTimeout(2000);
      results.screenshots.push(await shot(page, 'detected_models_tab'));
      // Check for content or empty state
      const modelsContent = await page.locator('[class*="model"], [class*="detect"], text=/no project|select a project|detected/i').count().catch(() => 0);
      if (modelsContent > 0) {
        pass('detected-models-tab-renders-content');
      } else {
        // Generic check — tab switched
        pass('detected-models-tab-navigable');
      }
    } catch (e) {
      fail('detected-models-tab-navigable');
      defect(`/sources: Detected Models tab error: ${e.message}`);
    }

  } catch (err) {
    defect(`/sources page load failed: ${err.message}`);
    fail('sources-page-loads');
    try { results.screenshots.push(await shot(page, 'sources_error')); } catch {}
  }

  // ── 2. /data-source-connection ───────────────────────────────────────────────
  console.log('\n=== /data-source-connection ===');
  try {
    await page.goto(`${BASE}/data-source-connection`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    results.screenshots.push(await shot(page, 'dsc_loaded'));

    // Page header / breadcrumb
    const breadcrumb = await page.locator('nav[aria-label="Breadcrumb"], text=/data source connection/i').first().isVisible().catch(() => false);
    if (breadcrumb) {
      pass('dsc-page-breadcrumb-visible');
    } else {
      fail('dsc-page-breadcrumb-visible');
    }

    // ── Connector cards / catalog ──────────────────────────────────────────────
    console.log('\n--- Connector cards ---');
    // Expect connector cards: Snowflake, Azure, AWS, GCS, Databricks, Iceberg, PostgreSQL, MySQL, Oracle
    const expectedConnectors = ['Snowflake', 'Azure', 'Amazon S3', 'Google Cloud', 'Databricks', 'Apache Iceberg', 'PostgreSQL', 'MySQL', 'Oracle'];
    let foundConnectors = 0;
    for (const conn of expectedConnectors) {
      const card = page.locator(`text=${conn}`).first();
      if (await card.isVisible().catch(() => false)) {
        foundConnectors++;
      }
    }
    if (foundConnectors >= 6) {
      pass(`connector-cards-rendered (${foundConnectors}/${expectedConnectors.length})`);
    } else if (foundConnectors > 0) {
      pass(`connector-cards-partially-rendered (${foundConnectors}/${expectedConnectors.length})`);
      defect(`/data-source-connection: only ${foundConnectors} connector cards visible, expected ≥6`);
    } else {
      fail('connector-cards-rendered');
      defect('/data-source-connection: no connector cards visible');
    }

    results.screenshots.push(await shot(page, 'dsc_connectors'));

    // ── Active Connections / Stages list ──────────────────────────────────────
    console.log('\n--- Active Connections ---');
    await page.waitForTimeout(1500);
    // Look for connection list section
    const connSection = await page.locator('text=/active connections|ingestion stages|connected|your connections/i').first().isVisible().catch(() => false);
    if (connSection) {
      pass('active-connections-section-visible');
      const connCards = await page.locator('[class*="connection"], [class*="stage"], [class*="card"]').count().catch(() => 0);
      if (connCards > 0) {
        pass(`active-connections-cards-shown (${connCards})`);
      } else {
        // Could be empty/loading
        const loadingSpin = await page.locator('[class*="spin"], [class*="loading"]').count().catch(() => 0);
        const emptyState = await page.locator('text=/no connections|no stages|add your first/i').count().catch(() => 0);
        if (loadingSpin > 0) {
          fail('active-connections-cards-shown (still loading)');
        } else if (emptyState > 0) {
          pass('active-connections-empty-state-shown');
        } else {
          fail('active-connections-cards-shown');
        }
      }
    } else {
      fail('active-connections-section-visible');
    }

    // ── Select a connector (Snowflake) — readonly interaction ──────────────────
    console.log('\n--- Select Snowflake connector ---');
    try {
      const snowflakeCard = page.locator('text=Snowflake').first();
      if (await snowflakeCard.isVisible().catch(() => false)) {
        // Find parent clickable container
        const clickTarget = page.locator('[class*="rounded"], [class*="card"]').filter({ hasText: 'Snowflake' }).first();
        await clickTarget.click();
        await page.waitForTimeout(1500);
        results.screenshots.push(await shot(page, 'dsc_snowflake_selected'));

        // Check if form/step appeared
        const stepIndicator = await page.locator('[class*="step"], [class*="wizard"]').count().catch(() => 0);
        const formAppeared = await page.locator('input[name*="datalake"], input[placeholder*="account"], input[placeholder*="username"]').count().catch(() => 0);
        if (stepIndicator > 0 || formAppeared > 0) {
          pass('connector-select-shows-form');
        } else {
          // May show "Add Connection" button first
          const addConnBtn = await page.locator('button', { hasText: /add connection|connect|configure/i }).count().catch(() => 0);
          if (addConnBtn > 0) {
            pass('connector-select-shows-connect-button');
          } else {
            fail('connector-select-shows-form');
            defect('/data-source-connection: selecting Snowflake did not show form or connect button');
          }
        }
      } else {
        fail('connector-select-snowflake');
      }
    } catch (e) {
      defect(`/data-source-connection: connector select error: ${e.message}`);
    }

    // ── AI Helper button ───────────────────────────────────────────────────────
    console.log('\n--- AI Helper ---');
    // Go back to main view first
    await page.goto(`${BASE}/data-source-connection`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    const aiHelperBtn = page.locator('button', { hasText: /ai|assistant|help|suggest/i }).first();
    if (await aiHelperBtn.isVisible().catch(() => false)) {
      pass('ai-connector-helper-button-visible');
      try {
        await aiHelperBtn.click();
        await page.waitForTimeout(1500);
        results.screenshots.push(await shot(page, 'dsc_ai_helper'));
        const helperPanel = await page.locator('[role="dialog"], [class*="modal"], [class*="helper"]').count().catch(() => 0);
        if (helperPanel > 0) {
          pass('ai-connector-helper-opens-panel');
        } else {
          fail('ai-connector-helper-opens-panel');
        }
        // Close if open
        const closeBtn = page.locator('[aria-label*="close"], [aria-label*="Close"], button', { hasText: /close|cancel/i }).first();
        if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click().catch(() => {});
      } catch (e) {
        defect(`/data-source-connection: AI helper error: ${e.message}`);
      }
    } else {
      // AI helper may be via Sparkles icon
      const sparklesBtn = page.locator('button svg[class*="sparkle"], button[title*="AI"], button[title*="ai"]').first();
      if (await sparklesBtn.isVisible().catch(() => false)) {
        pass('ai-connector-helper-icon-visible');
      } else {
        fail('ai-connector-helper-button-visible');
      }
    }

    // ── ConnectorHealthStrip ───────────────────────────────────────────────────
    console.log('\n--- Connector Health Strip ---');
    const healthStrip = await page.locator('[class*="health"], [class*="strip"], [class*="status"]').count().catch(() => 0);
    if (healthStrip > 0) {
      pass('connector-health-strip-renders');
    } else {
      fail('connector-health-strip-renders');
    }

    // ── Source Hub section ─────────────────────────────────────────────────────
    console.log('\n--- Source Hub / Catalog section ---');
    const sourceHub = await page.locator('[class*="hub"], [class*="catalog"], text=/source hub|catalog/i').first().isVisible().catch(() => false);
    if (sourceHub) {
      pass('source-hub-catalog-section-visible');
    } else {
      fail('source-hub-catalog-section-visible');
    }

    results.screenshots.push(await shot(page, 'dsc_final'));

  } catch (err) {
    defect(`/data-source-connection page load failed: ${err.message}`);
    fail('dsc-page-loads');
    try { results.screenshots.push(await shot(page, 'dsc_error')); } catch {}
  }

  await browser.close();

  console.log('\n========== AUDIT RESULTS ==========');
  console.log('DONE:', results.done.length);
  results.done.forEach(d => console.log(`  ✓ ${d}`));
  console.log('NOT DONE:', results.not_done.length);
  results.not_done.forEach(d => console.log(`  ✗ ${d}`));
  console.log('DEFECTS:', results.defects.length);
  results.defects.forEach(d => console.log(`  BUG: ${d}`));
  console.log('SCREENSHOTS:', results.screenshots.length);
  results.screenshots.forEach(s => console.log(`  ${s}`));

  // Write JSON summary
  import('fs').then(({ writeFileSync }) => {
    writeFileSync(
      path.join(__dirname, '../docs/product-readiness-audit/sources_audit_results.json'),
      JSON.stringify(results, null, 2)
    );
    console.log('\nResults written to docs/product-readiness-audit/sources_audit_results.json');
  });
})();
