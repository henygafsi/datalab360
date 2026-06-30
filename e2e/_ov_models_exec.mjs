/**
 * Final execution pass:
 * 1. Open deploy panel → navigate to Checks → click "Run Checks"
 * 2. Navigate to Dry Run → click "Start Full Dry Run"
 * 3. Navigate to Diff → click "Fetch Server Diff"
 * 4. Check AI discovery final result
 */

import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_STATE = path.resolve(__dirname, '.auth/state.json');
const SCREENS = path.resolve(__dirname, '../docs/product-readiness-audit/screens/overnight/models');

const done = [];
const not_done = [];
const defects = [];
const screenshots = [];
let ssIdx = 200;

async function ss(page, label) {
  ssIdx++;
  const n = String(ssIdx).padStart(2, '0');
  const file = path.join(SCREENS, `${n}_${label.replace(/[^a-z0-9]/gi, '_')}.png`);
  await page.screenshot({ path: file, fullPage: false });
  screenshots.push(file);
  console.log(`[SS] ${n} ${label}`);
  return file;
}

async function clickNext(page, label) {
  const btn = page.locator(`button:has-text("${label}")`).last();
  if (await btn.count() > 0) {
    await btn.click({ force: true });
    await page.waitForTimeout(1500);
    return true;
  }
  return false;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: AUTH_STATE,
    viewport: { width: 1600, height: 1000 },
  });
  const page = await ctx.newPage();

  // Load page
  await page.goto(
    'http://localhost:3000/explore-design?project_id=proj_25447131ab9e&view=catalog',
    { waitUntil: 'domcontentloaded', timeout: 30_000 }
  );
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    if (await page.locator('select').first().locator('option').count().catch(() => 0) >= 2) break;
  }
  await page.waitForTimeout(2000);
  console.log('Page loaded');

  // ── Open Deploy panel ──
  // Switch to Modeling tab
  await page.locator('button:has-text("Modeling"), [role="tab"]:has-text("Modeling")').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(2000);

  // Click Deploy toolbar button
  const deployBtn = page.locator('button').filter({ hasText: /^Deploy/ }).first();
  await deployBtn.click({ force: true });
  await page.waitForTimeout(5000);

  // Verify panel opened
  const panelOpen = await page.locator('text=/Total DDL|No pending|Review.*Config|Checks.*Dry/i').count();
  console.log('Deploy panel open:', panelOpen > 0);
  if (panelOpen === 0) {
    // Try mini-rail
    const miniIcon = page.locator('[aria-label*="Deploy"], [aria-label*="deploy"]').first();
    await miniIcon.click({ force: true }).catch(() => {});
    await page.waitForTimeout(3000);
  }
  await ss(page, 'exec_00_panel_open');

  // ── Navigate to Config (to start stepper traversal) ──
  console.log('\n--- Navigate to Config ---');
  await clickNext(page, 'Configure');
  await ss(page, 'exec_01_config');

  // ── Navigate to Checks ──
  console.log('\n--- Navigate to Checks ---');
  await clickNext(page, 'Pre-Checks');
  await page.waitForTimeout(1000);
  await ss(page, 'exec_02_checks_before_run');

  // Click "Run Checks" (structural first)
  console.log('Clicking Run Checks (structural)...');
  const structuralRunBtn = page.locator('button:has-text("Run Checks")').first();
  const structuralCount = await structuralRunBtn.count();
  console.log('"Run Checks" button count:', structuralCount);

  if (structuralCount > 0) {
    await structuralRunBtn.click({ force: true });
    // Wait up to 20s for check result
    try {
      await page.waitForSelector('text=/passed|failed|error|warning|0 issue|0 error|check.*complete/i', { timeout: 20000 });
      const checkResult = await page.locator('text=/passed|failed|error|warning|issue|complete/i').first().textContent().catch(() => '');
      console.log('Checks result:', checkResult);
      if (/failed|error/i.test(checkResult)) {
        not_done.push(`Checks/Run Checks: returned errors — "${checkResult.substring(0, 80)}"`);
        defects.push(`explore-design/checks: "${checkResult.substring(0, 80)}"`);
      } else {
        done.push(`Checks step: "Run Checks" executes, result = "${checkResult.substring(0, 60)}"`);
      }
    } catch {
      // Check if spinner/loading is still showing
      const stillLoading = await page.locator('text=/running|checking|validating/i').count();
      console.log('Checks still loading:', stillLoading);
      if (stillLoading > 0) {
        not_done.push('Checks/Run Checks: still loading after 20s (slow warehouse validation)');
      } else {
        not_done.push('Checks/Run Checks: no recognizable result within 20s');
      }
    }
  } else {
    not_done.push('Checks step: "Run Checks" button not found');
  }
  await ss(page, 'exec_03_checks_result');

  // ── Navigate to Dry Run ──
  console.log('\n--- Navigate to Dry Run ---');
  await clickNext(page, 'Dry Run');
  await page.waitForTimeout(1000);
  await ss(page, 'exec_04_dry_run_before');

  // Click "Start Full Dry Run"
  console.log('Clicking "Start Full Dry Run"...');
  const dryRunBtn = page.locator('button:has-text("Start Full Dry Run")').first();
  const dryRunCount = await dryRunBtn.count();
  console.log('"Start Full Dry Run" button count:', dryRunCount);

  if (dryRunCount > 0) {
    const isDisabled = await dryRunBtn.getAttribute('disabled');
    console.log('Disabled:', isDisabled);
    if (!isDisabled) {
      await dryRunBtn.click({ force: true });
      console.log('Dry run started, waiting for result (up to 30s)...');
      try {
        // Wait for completion indicators
        await page.waitForSelector('text=/completed|success|failed|0 DDL|dry.run.*complete|Dry.Run.*Complete|result|statements|rows/i', { timeout: 30000 });
        const dryResult = await page.locator('text=/completed|success|failed|DDL|statements|rows|result/i').first().textContent().catch(() => '');
        console.log('Dry run result:', dryResult);
        if (/failed|error/i.test(dryResult)) {
          not_done.push(`Dry Run execution: error — "${dryResult.substring(0, 80)}"`);
          defects.push(`explore-design/dry-run: "${dryResult.substring(0, 80)}"`);
        } else {
          done.push(`Dry Run: "Start Full Dry Run" executes, result = "${dryResult.substring(0, 60)}"`);
        }
      } catch {
        const loading = await page.locator('text=/running|in.progress|preparing/i').count();
        console.log('Dry run still loading:', loading);
        if (loading > 0) {
          not_done.push('Dry Run: still in progress after 30s (backend clone-based dry run may be slow)');
        } else {
          // Check what's on screen
          const anyText = await page.locator('[class*="deploy"], [class*="panel"]').first().innerText().catch(() => '');
          console.log('Panel text after dry run:', anyText.substring(0, 200));
          not_done.push('Dry Run: button clicked, no success/error response visible within 30s');
        }
      }
    } else {
      not_done.push('Dry Run: "Start Full Dry Run" button disabled');
    }
  } else {
    not_done.push('Dry Run: "Start Full Dry Run" button not found');
  }
  await ss(page, 'exec_05_dry_run_result');

  // ── Navigate to Diff ──
  console.log('\n--- Navigate to Diff ---');
  await clickNext(page, 'SQL Diff');
  await page.waitForTimeout(1000);
  await ss(page, 'exec_06_diff_before');

  // Click "Fetch Server Diff"
  console.log('Clicking "Fetch Server Diff"...');
  const fetchDiffBtn = page.locator('button:has-text("Fetch Server Diff"), button:has-text("Fetch")').first();
  const fetchCount = await fetchDiffBtn.count();
  console.log('"Fetch Server Diff" count:', fetchCount);

  if (fetchCount > 0) {
    const dis = await fetchDiffBtn.getAttribute('disabled');
    if (!dis) {
      await fetchDiffBtn.click({ force: true });
      try {
        await page.waitForSelector('text=/no.*diff|no.*change|CREATE|ALTER|DROP|error|diff.*complete/i', { timeout: 15000 });
        const diffResult = await page.locator('text=/no.*diff|no.*change|CREATE|ALTER|DROP|error/i').first().textContent().catch(() => '');
        console.log('Diff result:', diffResult);
        if (/error/i.test(diffResult)) {
          not_done.push(`Diff/Fetch: error — "${diffResult.substring(0, 80)}"`);
          defects.push(`explore-design/sql-diff: "${diffResult.substring(0, 80)}"`);
        } else {
          done.push(`Diff step: "Fetch Server Diff" executes, result = "${diffResult.substring(0, 60)}"`);
        }
      } catch {
        not_done.push('Diff: fetch timed out (15s)');
      }
    } else {
      not_done.push('Diff: Fetch Server Diff button disabled');
    }
  } else {
    not_done.push('Diff: "Fetch Server Diff" button not found');
  }
  await ss(page, 'exec_07_diff_result');

  // ── Navigate to Impact ──
  console.log('\n--- Navigate to Impact ---');
  await clickNext(page, 'Impact');
  await page.waitForTimeout(1000);
  const impactContent = await page.locator('text=/Impact Analysis|Affected Tables|DDL Operations/i').count();
  console.log('Impact content:', impactContent);
  if (impactContent > 0) {
    const impactText = await page.locator('text=/Impact Analysis|Affected Tables/i').first().textContent().catch(() => '');
    done.push(`Impact step: renders analysis metrics (${impactText.substring(0, 40)})`);
  }
  await ss(page, 'exec_08_impact');

  // ── Check Verify step (visible but not executable) ──
  console.log('\n--- Verify step availability ---');
  const verifyTab = page.locator('button').filter({ hasText: 'Verify' }).first();
  const verifyCount = await verifyTab.count();
  console.log('"Verify" tab count:', verifyCount);
  if (verifyCount > 0) {
    not_done.push('Verify step: tab visible in stepper (requires prior successful deploy to activate)');
  }

  await ss(page, 'exec_09_final');
  await browser.close();

  console.log('\n==============================');
  console.log('DONE:', done);
  console.log('NOT_DONE:', not_done);
  console.log('DEFECTS:', defects);
  console.log('==============================\n');

  process.stdout.write('\nRESULT_JSON:' + JSON.stringify({ done, not_done, defects, screenshots }) + '\n');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.stdout.write('\nRESULT_JSON:' + JSON.stringify({ done, not_done, defects: [...defects, `FATAL: ${err.message}`], screenshots }) + '\n');
  process.exit(1);
});
