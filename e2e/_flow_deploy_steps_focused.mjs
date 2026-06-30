/**
 * Explore & Design — focused deploy stepper navigation
 * Approach: Catalog view → click table → click Deploy in actions panel → navigate all 8 steps
 */
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SCREENS = 'docs/product-readiness-audit/screens/explore-design-deploy';
fs.mkdirSync(SCREENS, { recursive: true });

const URL = 'http://localhost:3000/explore-design?project_id=proj_25447131ab9e&view=catalog';

let stepIdx = 0;
async function shot(page, label) {
  stepIdx++;
  const n = String(stepIdx).padStart(2, '0');
  const f = path.join(SCREENS, `step_${n}_${label.replace(/[^a-z0-9]+/gi,'_').toLowerCase()}.png`);
  await page.screenshot({ path: f, fullPage: false });
  console.log(`[shot] ${f}`);
  return f;
}

const fivexx = [];

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 60 });
  const ctx = await browser.newContext({
    storageState: 'e2e/.auth/state.json',
    viewport: { width: 1600, height: 1000 },
  });
  const page = await ctx.newPage();

  page.on('response', r => {
    if (r.status() >= 500) fivexx.push(`${r.status()} ${r.url()}`);
  });

  // ── 1. Navigate ──
  console.log('[1] loading catalog view...');
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for project to auto-select (up to 30s)
  let loaded = false;
  for (let i = 0; i < 60; i++) {
    const hasSelect = await page.locator('select').count();
    if (hasSelect > 0) {
      const opts = await page.locator('select').first().locator('option').allInnerTexts().catch(() => []);
      if (opts.filter(o => o.trim()).length > 1) { loaded = true; break; }
    }
    // Also check for Source Tables
    const hasSrc = await page.locator('text=Source Tables').isVisible({ timeout: 500 }).catch(() => false);
    if (hasSrc) { loaded = true; break; }
    await page.waitForTimeout(500);
  }
  console.log(`[1] project loaded: ${loaded}`);
  await shot(page, 'initial');

  // ── 2. Ensure we're in Catalog view ──
  const catalogTab = page.locator('button').filter({ hasText: /^Catalog$/i }).first();
  if (await catalogTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await catalogTab.click({ force: true });
    await page.waitForTimeout(1000);
  }
  await shot(page, 'catalog_view');

  // ── 3. Click on FACT_ORDERS table in the source list ──
  console.log('[3] clicking FACT_ORDERS table...');
  const factOrders = page.locator('text=FACT_ORDERS').first();
  if (await factOrders.isVisible({ timeout: 5000 }).catch(() => false)) {
    await factOrders.click({ force: true });
    await page.waitForTimeout(1500);
    await shot(page, 'fact_orders_selected');
  } else {
    // Fall back to any visible table
    const anyTable = page.locator('text=/DIM_|FACT_/i').first();
    if (await anyTable.isVisible({ timeout: 3000 }).catch(() => false)) {
      await anyTable.click({ force: true });
      await page.waitForTimeout(1500);
    }
    await shot(page, 'table_selected_fallback');
  }

  // ── 4. Click "Deploy" in the table actions right panel ──
  console.log('[4] clicking Deploy in actions panel...');
  // The deploy button inside the table actions (right panel)
  const deployInActions = page.locator('button').filter({ hasText: /^Deploy$/i }).last();
  if (await deployInActions.isVisible({ timeout: 5000 }).catch(() => false)) {
    await deployInActions.click({ force: true });
    console.log('[4] clicked Deploy in actions panel');
    await page.waitForTimeout(1500);
  }
  await shot(page, 'deploy_opened');

  // ── 5. Wait for Deploy stepper to appear ──
  console.log('[5] waiting for deploy stepper...');
  try {
    await page.waitForSelector('button[aria-current="step"]', { timeout: 10000 });
    console.log('[5] stepper found via aria-current=step');
  } catch {
    // Try alternate: wait for "Review" text in the deploy panel
    await page.waitForSelector('text=Review', { timeout: 5000 }).catch(() => null);
    console.log('[5] stepper found via Review text');
  }
  await page.waitForTimeout(1000);
  await shot(page, 'deploy_stepper_visible');

  // ── 6. STEP 1: Review ──
  console.log('[6] === REVIEW STEP ===');
  // Expand AI Relationship Discovery
  const aiRelBtn = page.locator('text=AI Relationship Discovery').first();
  if (await aiRelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await aiRelBtn.click({ force: true });
    await page.waitForTimeout(2500);
    console.log('[6] AI Relationship Discovery expanded');
  }
  await shot(page, 'step_1_review_ai_rel');

  // Expand AI Schema Health
  const aiSchemaBtn = page.locator('text=AI Schema Health').first();
  if (await aiSchemaBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await aiSchemaBtn.click({ force: true });
    await page.waitForTimeout(2500);
    console.log('[6] AI Schema Health expanded');
  }
  await shot(page, 'step_1_review_ai_schema');

  // ── 7. Navigate: Review → Configure ──
  console.log('[7] clicking Configure → button...');
  // Wait for the Configure button to appear (it's in the panel footer)
  let configureBtn = null;
  try {
    await page.waitForFunction(
      () => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.some(b => b.textContent?.trim().startsWith('Configure'));
      },
      { timeout: 8000 }
    );
    console.log('[7] Configure button appeared in DOM');
  } catch {
    console.warn('[7] Configure button wait timed out');
  }

  // Scroll to bottom of the panel to ensure footer is visible
  const panelScrollArea = page.locator('.overflow-y-auto').last();
  if (await panelScrollArea.isVisible({ timeout: 1000 }).catch(() => false)) {
    await panelScrollArea.evaluate(el => el.scrollTop = el.scrollHeight);
    await page.waitForTimeout(300);
  }

  // Click Configure
  const configBtn = page.locator('button').filter({ hasText: /Configure/i }).last();
  if (await configBtn.count() > 0) {
    await configBtn.click({ force: true, timeout: 5000 }).catch(e => console.warn('[7] Configure click error:', e.message.slice(0, 100)));
  } else {
    console.warn('[7] Configure button not found in DOM');
  }
  await page.waitForTimeout(1500);
  await shot(page, 'step_2_config');

  // ── 8. Navigate: Configure → Pre-Checks ──
  console.log('[8] navigating to Pre-Checks...');
  const preChecksBtn = page.locator('button').filter({ hasText: /Pre.?Check/i }).last();
  if (await preChecksBtn.count() > 0) {
    await preChecksBtn.click({ force: true, timeout: 5000 }).catch(e => console.warn('[8] Pre-Checks click:', e.message.slice(0, 80)));
  }
  await page.waitForTimeout(1500);
  await shot(page, 'step_3_prechecks_initial');

  // Try running checks
  const runChecksBtn = page.locator('button').filter({ hasText: /run.?check/i }).first();
  if (await runChecksBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await runChecksBtn.click({ force: true });
    console.log('[8] running pre-checks...');
    await page.waitForTimeout(7000);
  }
  await shot(page, 'step_3_prechecks_ran');

  // ── 9. Navigate: Pre-Checks → Dry Run ──
  console.log('[9] navigating to Dry Run...');
  const dryRunNextBtn = page.locator('button').filter({ hasText: /Dry Run/i }).last();
  if (await dryRunNextBtn.count() > 0) {
    await dryRunNextBtn.click({ force: true, timeout: 5000 }).catch(e => console.warn('[9] Dry Run click:', e.message.slice(0, 80)));
  }
  await page.waitForTimeout(1500);
  await shot(page, 'step_4_dryrun_initial');

  // Try starting dry run
  const dryRunStartBtn = page.locator('button').filter({ hasText: /Start|Run/i }).filter({ hasText: /Dry|dry/i }).first();
  if (await dryRunStartBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await dryRunStartBtn.click({ force: true });
    console.log('[9] started dry run...');
    await page.waitForTimeout(8000);
  }
  await shot(page, 'step_4_dryrun_result');

  // ── 10. Navigate: Dry Run → SQL Diff ──
  console.log('[10] navigating to SQL Diff...');
  const sqlDiffBtn = page.locator('button').filter({ hasText: /SQL Diff/i }).last();
  if (await sqlDiffBtn.count() > 0) {
    await sqlDiffBtn.click({ force: true, timeout: 5000 }).catch(e => console.warn('[10] SQL Diff click:', e.message.slice(0, 80)));
  }
  await page.waitForTimeout(1500);
  await shot(page, 'step_5_sql_diff');

  // ── 11. Navigate: SQL Diff → Impact ──
  console.log('[11] navigating to Impact...');
  const impactBtn = page.locator('button').filter({ hasText: /^Impact$/i }).last();
  if (await impactBtn.count() > 0) {
    await impactBtn.click({ force: true, timeout: 5000 }).catch(e => console.warn('[11] Impact click:', e.message.slice(0, 80)));
  }
  await page.waitForTimeout(3000);
  await shot(page, 'step_6_impact');

  // ── 12. Navigate: Impact → Deploy ──
  console.log('[12] navigating to Deploy step...');
  const deployStepBtn = page.locator('button').filter({ hasText: /^Deploy$/i }).last();
  if (await deployStepBtn.count() > 0) {
    await deployStepBtn.click({ force: true, timeout: 5000 }).catch(e => console.warn('[12] Deploy step click:', e.message.slice(0, 80)));
  }
  await page.waitForTimeout(1500);
  await shot(page, 'step_7_deploy_view');

  // DON'T execute deployment — just screenshot the view
  const execBtn = page.locator('button').filter({ hasText: /execute deployment|run deploy/i }).first();
  const execVis = await execBtn.isVisible({ timeout: 2000 }).catch(() => false);
  console.log(`[12] Execute Deployment visible: ${execVis}`);

  // ── 13. Verify Step ──
  console.log('[13] checking Verify step...');
  const verifyPill = page.locator('button').filter({ hasText: /^Verify$/i }).first();
  const vEnabled = await verifyPill.isEnabled({ timeout: 1000 }).catch(() => false);
  if (vEnabled) {
    await verifyPill.click({ force: true });
    await page.waitForTimeout(1500);
  }
  await shot(page, 'step_8_verify');

  // ── 14. Back to Review ──
  const revPill = page.locator('button').filter({ hasText: /^Review$/i }).first();
  if (await revPill.isEnabled({ timeout: 1000 }).catch(() => false)) {
    await revPill.click({ force: true });
    await page.waitForTimeout(800);
  }
  await shot(page, 'deploy_back_to_review');

  // ── 15. Summary ──
  console.log('\n=== SUMMARY ===');
  console.log(`5xx: ${fivexx.length}`);
  fivexx.forEach(e => console.log(' 5xx:', e));
  console.log(`Screenshots written to ${SCREENS}/step_*.png`);

  await ctx.close();
  await browser.close();
  console.log('[done]');
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
