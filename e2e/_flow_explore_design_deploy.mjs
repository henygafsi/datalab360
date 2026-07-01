/**
 * Explore & Design — full deploy-tab flow (v3)
 * Key fixes:
 *  1. Close all open dropdowns/overlays before critical clicks
 *  2. Use force:true on Next buttons (they may sit below fixed overlays)
 *  3. Proper schema deselection before selecting RETAIL_DW only
 */
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SCREENS = 'docs/product-readiness-audit/screens/explore-design-deploy';
fs.mkdirSync(SCREENS, { recursive: true });

const BASE = 'http://localhost:3000';
const URL = `${BASE}/explore-design?project_id=proj_25447131ab9e&view=catalog`;

let stepIdx = 0;
async function shot(page, label) {
  stepIdx++;
  const num = String(stepIdx).padStart(2, '0');
  const safe = label.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  const file = path.join(SCREENS, `${num}_${safe}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`[shot] ${file}`);
  return file;
}

const consoleErrors = [];
const fivexx = [];

/** Close any open dropdown overlays by pressing Escape and waiting */
async function closeOverlays(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  // Wait for fixed overlays to disappear
  try {
    await page.waitForSelector('div.fixed.inset-0.z-30', { state: 'detached', timeout: 3000 });
  } catch {
    // May already be gone, that's fine
  }
  await page.waitForTimeout(300);
}

/** Click the stepper's Next button — uses force:true to bypass pointer overlays */
async function clickNextDeployStep(page, expectedNextLabel) {
  // Locators by multiple strategies
  const strategies = [
    // Exact getByRole
    () => page.getByRole('button', { name: new RegExp(`^${expectedNextLabel}$`) }).last(),
    // hasText filter
    () => page.locator('button').filter({ hasText: expectedNextLabel }).last(),
    // CSS pseudo
    () => page.locator(`button:has-text("${expectedNextLabel}")`).last(),
  ];
  for (const strat of strategies) {
    const loc = strat();
    try {
      const count = await loc.count();
      if (count > 0) {
        // Use force to bypass any overlay interceptors
        await loc.click({ force: true, timeout: 5000 });
        console.log(`[nav] advanced to step: ${expectedNextLabel}`);
        return true;
      }
    } catch (e) {
      console.warn(`[nav] strategy failed for "${expectedNextLabel}": ${e.message.slice(0, 80)}`);
    }
  }
  console.warn(`[nav] could not find Next button for "${expectedNextLabel}"`);
  return false;
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const ctx = await browser.newContext({
    storageState: 'e2e/.auth/state.json',
    viewport: { width: 1600, height: 1000 },
  });
  const page = await ctx.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('response', (resp) => {
    if (resp.status() >= 500) {
      const e = `5xx ${resp.status()} ${resp.url()}`;
      fivexx.push(e);
      console.error(`[5xx] ${e}`);
    }
  });

  // ── 1. Navigate and wait for project to load ──
  console.log('[1] loading explore-design...');
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await Promise.race([
    page.waitForSelector('text=Source Tables', { timeout: 25000 }).catch(() => null),
    page.waitForSelector('text=Choose an explore', { timeout: 25000 }).catch(() => null),
  ]);
  await page.waitForTimeout(2000);
  await shot(page, 'initial_load');

  // If project chooser is showing, pick the project
  const chooser = page.locator('text=Choose an explore & design project');
  if (await chooser.isVisible({ timeout: 1000 }).catch(() => false)) {
    const projectCard = page.locator('text=/Wizard project/i').first();
    if (await projectCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projectCard.click();
      await page.waitForSelector('text=Source Tables', { timeout: 20000 });
      await page.waitForTimeout(2000);
    }
  }
  await shot(page, 'project_loaded');

  // ── 2. Change source database to DRAFT_SOURCE ──
  // Wait for the project to auto-select from the URL param (up to 20s)
  console.log('[2] waiting for project to auto-select and DB list to populate...');
  let dbSelect = page.locator('select').first();
  let dbOpts = [];
  for (let i = 0; i < 40; i++) {
    dbOpts = await dbSelect.locator('option').allInnerTexts().catch(() => []);
    if (dbOpts.filter(o => o.trim()).length > 1) break; // at least one real option
    // Also try waiting for Source Tables to appear (alternative sign project loaded)
    const hasSrc = await page.locator('text=Source Tables').isVisible({ timeout: 500 }).catch(() => false);
    if (hasSrc) { dbOpts = await dbSelect.locator('option').allInnerTexts().catch(() => []); break; }
    await page.waitForTimeout(500);
  }
  console.log('[db] options:', dbOpts.join(', '));
  if (dbOpts.includes('DRAFT_SOURCE')) {
    await dbSelect.selectOption('DRAFT_SOURCE');
    console.log('[db] selected DRAFT_SOURCE');
    await page.waitForTimeout(2500); // wait for schemas to load
  }
  await shot(page, 'db_selected');

  // ── 3. Select RETAIL_DW schema (keep any existing schemas selected too) ──
  console.log('[3] selecting schema RETAIL_DW...');
  const schemaBtn = page.locator('button[aria-label="Select schemas"]').first();
  if (await schemaBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    // Open schema dropdown
    await schemaBtn.click({ force: true });
    await page.waitForTimeout(1000);

    // Select RETAIL_DW in the dropdown list
    const retailDW = page.locator('text=RETAIL_DW').first();
    if (await retailDW.isVisible({ timeout: 3000 }).catch(() => false)) {
      await retailDW.click({ force: true });
      console.log('[schema] clicked RETAIL_DW in dropdown');
      await page.waitForTimeout(500);
    } else {
      console.log('[schema] RETAIL_DW not found in schema dropdown');
    }

    // Close the schema dropdown by clicking the schema button again (toggle) with force:true
    // to bypass the z-30 backdrop that intercepts regular clicks
    await schemaBtn.click({ force: true });
    await page.waitForTimeout(500);
    // Verify overlay is gone
    await page.waitForSelector('div.fixed.inset-0.z-30', { state: 'detached', timeout: 5000 }).catch(() => null);
    await page.waitForTimeout(500);
  } else {
    console.log('[schema] schema button not found, continuing without schema selection');
  }

  await page.waitForTimeout(2000);
  await shot(page, 'schema_selected_retail_dw');

  // ── 4. Show source tables list (Catalog view) ──
  console.log('[4] verifying source tables loaded...');
  const tableCount = await page.locator('text=Source Tables').first().isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`[tables] Source Tables visible: ${tableCount}`);
  // Count dim/fact tables by looking at source table list items
  const allTableItems = await page.locator('.text-sm.font-medium, [class*="table-name"]').count();
  console.log(`[tables] ~${allTableItems} table items`);
  await shot(page, 'source_tables_retail_dw');

  // ── 5. Note tables in RETAIL_DW ──
  // Click on FACT_FINANCE to load it (single click = select)
  const factFinance = page.locator('text=FACT_FINANCE').first();
  if (await factFinance.isVisible({ timeout: 3000 }).catch(() => false)) {
    await factFinance.click({ force: true });
    await page.waitForTimeout(1000);
    await shot(page, 'fact_finance_selected');
    // Close any panel that opened
    await closeOverlays(page);
  }

  // Click on DIM_CLIENTS
  const dimClients = page.locator('text=DIM_CLIENTS').first();
  if (await dimClients.isVisible({ timeout: 2000 }).catch(() => false)) {
    await dimClients.click({ force: true });
    await page.waitForTimeout(800);
    await closeOverlays(page);
  }

  // ── 6. Switch to Modeling view ──
  console.log('[6] switching to Modeling view...');
  await closeOverlays(page); // Ensure no overlays before clicking
  const modelingTab = page.locator('button').filter({ hasText: /^Modeling$/i }).first();
  if (await modelingTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await modelingTab.click({ force: true });
    await page.waitForTimeout(2500);
    await shot(page, 'modeling_view');
  } else {
    console.log('[6] Modeling tab not found by text, trying URL');
    const catTab = page.locator('button').filter({ hasText: /^Catalog$/i }).first();
    const catVisible = await catTab.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`[6] Catalog tab visible: ${catVisible}`);
    await shot(page, 'modeling_view_not_found');
  }

  // ── 7. Try AI Relationship Discovery (in toolbar) ──
  console.log('[7] looking for AI Model / Relationship Discovery...');
  const aiModelBtn = page.locator('button').filter({ hasText: /AI Model/i }).first();
  if (await aiModelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await aiModelBtn.click({ force: true });
    await page.waitForTimeout(2500);
    await shot(page, 'ai_model_panel_open');
    // Close it
    await closeOverlays(page);
    const closeBtns = page.locator('button').filter({ hasText: /^×$|close/i });
    const closeCount = await closeBtns.count();
    if (closeCount > 0) await closeBtns.first().click({ force: true });
    await page.waitForTimeout(500);
  } else {
    await shot(page, 'ai_model_btn_not_found');
  }

  // ── 8. Open Deploy right-panel ──
  console.log('[8] opening Deploy panel...');
  await closeOverlays(page); // ensure all dropdowns closed
  await page.waitForTimeout(500);

  // The blue Deploy button in the top-right toolbar
  const deployBtn = page.locator('button').filter({ hasText: /^Deploy$/i }).first();
  if (await deployBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await deployBtn.click({ force: true });
    console.log('[8] clicked Deploy toolbar button');
  } else {
    // Fallback: look for Rocket icon
    const allBtns = await page.locator('button').all();
    for (const btn of allBtns) {
      const title = await btn.getAttribute('title').catch(() => '');
      const txt = await btn.innerText().catch(() => '');
      if (title.toLowerCase() === 'deploy' || txt.toLowerCase() === 'deploy') {
        await btn.click({ force: true });
        console.log(`[8] clicked Deploy via: title="${title}" text="${txt}"`);
        break;
      }
    }
  }

  await page.waitForTimeout(2500);
  await shot(page, 'deploy_panel_open');

  // Verify stepper is visible
  const reviewStepper = page.locator('button[aria-current="step"]').first();
  const stepperOk = await reviewStepper.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`[deploy] stepper active step visible: ${stepperOk}`);

  if (!stepperOk) {
    // Dig: find all button texts near "Review"
    const buttons = await page.locator('button').all();
    const btnsWithReview = [];
    for (const b of buttons.slice(0, 30)) {
      const txt = await b.innerText().catch(() => '');
      if (txt.trim()) btnsWithReview.push(txt.trim().slice(0, 40));
    }
    console.log('[deploy] visible buttons:', btnsWithReview.join(' | '));
  }

  // ── 9. STEP: Review ──
  console.log('[9] === STEP: Review ===');
  await page.waitForTimeout(800);

  // Try to expand AI Relationship Discovery accordion
  const aiRelAccordion = page.locator('text=AI Relationship Discovery').first();
  if (await aiRelAccordion.isVisible({ timeout: 2000 }).catch(() => false)) {
    await aiRelAccordion.click({ force: true });
    await page.waitForTimeout(2000);
    console.log('[review] expanded AI Relationship Discovery');
  }
  await shot(page, 'deploy_step_review');

  // Also expand AI Schema Health
  const aiSchemaHealth = page.locator('text=AI Schema Health').first();
  if (await aiSchemaHealth.isVisible({ timeout: 1000 }).catch(() => false)) {
    await aiSchemaHealth.click({ force: true });
    await page.waitForTimeout(2000);
  }
  await shot(page, 'deploy_step_review_with_ai');

  // Scroll inside the deploy panel to find the Next button
  // The panel's scrollable area
  const deployPanelScroll = page.locator('[class*="overflow-y-auto"]').last();
  if (await deployPanelScroll.isVisible({ timeout: 1000 }).catch(() => false)) {
    await deployPanelScroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
  }
  await page.waitForTimeout(500);
  await shot(page, 'deploy_review_scrolled_to_footer');

  // ── 10. Navigate: Review → Configure ──
  console.log('[10] navigating to Configure step...');
  const advanced1 = await clickNextDeployStep(page, 'Configure');
  if (!advanced1) {
    console.log('[10] Configure button not found, trying force-scroll and retry');
    // Try scrolling the page to find the button
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await clickNextDeployStep(page, 'Configure');
  }
  await page.waitForTimeout(1200);
  await shot(page, 'deploy_step_config');

  // ── 11. Navigate: Configure → Pre-Checks ──
  console.log('[11] navigating to Pre-Checks step...');
  await clickNextDeployStep(page, 'Pre-Checks');
  await page.waitForTimeout(1200);
  await shot(page, 'deploy_step_checks_initial');

  // Run pre-checks
  const runChecksBtn = page.locator('button').filter({ hasText: /run.?checks?|run pre/i }).first();
  if (await runChecksBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('[checks] running pre-checks...');
    await runChecksBtn.click({ force: true });
    await page.waitForTimeout(7000);
  }
  await shot(page, 'deploy_step_checks_ran');

  // ── 12. Navigate: Pre-Checks → Dry Run ──
  console.log('[12] navigating to Dry Run step...');
  await clickNextDeployStep(page, 'Dry Run');
  await page.waitForTimeout(1200);
  await shot(page, 'deploy_step_dry_run_initial');

  // Run dry run
  const dryRunExecBtn = page.locator('button').filter({ hasText: /start|run|simulate|dry/i }).filter({ hasText: /dry/i }).first();
  if (await dryRunExecBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('[dry-run] starting dry run...');
    await dryRunExecBtn.click({ force: true });
    await page.waitForTimeout(8000);
  }
  await shot(page, 'deploy_step_dry_run_result');

  // ── 13. Navigate: Dry Run → SQL Diff ──
  console.log('[13] navigating to SQL Diff step...');
  await clickNextDeployStep(page, 'SQL Diff');
  await page.waitForTimeout(1500);
  await shot(page, 'deploy_step_sql_diff');

  // ── 14. Navigate: SQL Diff → Impact ──
  console.log('[14] navigating to Impact step...');
  await clickNextDeployStep(page, 'Impact');
  await page.waitForTimeout(3000); // Impact may auto-analyze
  await shot(page, 'deploy_step_impact');

  // ── 15. Navigate: Impact → Deploy step (view only — DON'T execute) ──
  console.log('[15] navigating to Deploy step (view only)...');
  await clickNextDeployStep(page, 'Deploy');
  await page.waitForTimeout(1500);
  await shot(page, 'deploy_step_execute_view');

  // Check for Execute button (don't click it)
  const execBtn = page.locator('button').filter({ hasText: /execute deployment|execute.*deploy|run.*deploy|start.*deploy/i }).first();
  const execVis = await execBtn.isVisible({ timeout: 2000 }).catch(() => false);
  console.log(`[deploy] Execute Deployment button visible: ${execVis}`);

  // ── 16. Try Verify step via pill ──
  console.log('[16] trying Verify step...');
  const verifyPill = page.locator('button').filter({ hasText: /^Verify$/i }).first();
  const vEnabled = await verifyPill.isEnabled({ timeout: 2000 }).catch(() => false);
  console.log(`[verify] Verify pill enabled: ${vEnabled}`);
  if (vEnabled) {
    await verifyPill.click({ force: true });
    await page.waitForTimeout(1500);
    await shot(page, 'deploy_step_verify');
  } else {
    await shot(page, 'deploy_step_verify_disabled');
  }

  // ── 17. Go back to Review (it should always be clickable as first step) ──
  console.log('[17] back to Review...');
  const reviewPill = page.locator('button').filter({ hasText: /^Review$/i }).first();
  if (await reviewPill.isEnabled({ timeout: 1000 }).catch(() => false)) {
    await reviewPill.click({ force: true });
    await page.waitForTimeout(800);
  }
  await shot(page, 'deploy_final_overview');

  // ── 18. Summary ──
  console.log('\n=== SUMMARY ===');
  console.log(`5xx errors: ${fivexx.length}`);
  fivexx.forEach(e => console.log(' 5xx:', e));
  console.log(`Console errors: ${consoleErrors.length}`);
  consoleErrors.slice(0, 15).forEach(e => console.log(' err:', e.slice(0, 200)));

  await ctx.close();
  await browser.close();
  console.log('\n[done] all steps complete');
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
