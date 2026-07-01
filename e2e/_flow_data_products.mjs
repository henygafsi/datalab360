/**
 * Flow audit: data-products page
 * Tests: KPI header, Create form (PublishGate), product detail right panel
 *        (Object360 / KpiLifecycle / Recommendations / ProductActivity),
 *        publish + subscribe gating.
 * Does NOT finalize any mutation.
 */
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE = 'http://localhost:3000';
const STORAGE = 'e2e/.auth/state.json';
const SCREEN_DIR = 'docs/product-readiness-audit/screens/data-products';
const TIMEOUT = 90_000;

fs.mkdirSync(SCREEN_DIR, { recursive: true });

const findings = {
  steps: [],
  consoleErrors: [],
  networkErrors: [],
  network4xx: [],
  defects: [],
};

function log(msg) { findings.steps.push(msg); console.log(msg); }
function defect(msg) { findings.defects.push(msg); console.error('[DEFECT]', msg); }

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: STORAGE,
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();

page.on('pageerror', (err) => {
  const m = (err?.message || String(err)).slice(0, 300);
  findings.consoleErrors.push(m);
});
page.on('console', (msg) => {
  if (msg.type() === 'error') findings.consoleErrors.push(`console.error: ${msg.text().slice(0, 200)}`);
});
page.on('response', (r) => {
  const url = r.url().replace(BASE, '').split('?')[0];
  const s = r.status();
  if (s >= 500) findings.networkErrors.push(`${s} ${url}`);
  else if (s >= 400 && !/(\.png|\.ico|\.svg|\.woff|favicon)/.test(url))
    findings.network4xx.push(`${s} ${url}`);
});

async function shot(name) {
  const p = path.join(SCREEN_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  log(`[screenshot] ${p}`);
  return p;
}
async function settle(ms = 5000) { await page.waitForTimeout(ms); }

// ---------------------------------------------------------------------------
// Step 1: Navigate to data-products
// ---------------------------------------------------------------------------
log('[step 1] navigate to /data-products');
await page.goto(`${BASE}/data-products`, { waitUntil: 'networkidle', timeout: TIMEOUT });
await settle(4000);
await shot('01_landing');

// ---------------------------------------------------------------------------
// Step 2: Check KPI tiles are rendered (not "—" across the board)
// ---------------------------------------------------------------------------
log('[step 2] check KPI tiles');
const kpiValues = await page.$$eval(
  'div.text-2xl.font-semibold',
  (els) => els.map((e) => e.textContent?.trim()),
);
log(`KPI values: ${JSON.stringify(kpiValues)}`);
const allDashes = kpiValues.length > 0 && kpiValues.every((v) => v === '—');
if (allDashes) defect('All KPI tiles show "—" — data fetch may have failed or products list is empty');
if (kpiValues.length === 0) defect('No KPI tiles found in DOM');

// ---------------------------------------------------------------------------
// Step 3: Open Create Product form
// ---------------------------------------------------------------------------
log('[step 3] open create product form');
const createBtn = page.locator('button:has-text("Create Product")').first();
const createBtnExists = await createBtn.count() > 0;
if (!createBtnExists) {
  defect('Create Product button not found');
} else {
  const isDisabled = await createBtn.isDisabled();
  log(`Create Product button disabled=${isDisabled}`);
  if (!isDisabled) {
    await createBtn.click();
    await settle(1500);
    await shot('02_create_form_open');

    // Inspect form fields
    const nameInput = page.locator('input[aria-label="Product name"]');
    const fqnInput = page.locator('input[aria-label="Table FQN"]');
    if (await nameInput.count() === 0) defect('Create form: name input missing');
    if (await fqnInput.count() === 0) defect('Create form: FQN input missing');

    // Try submitting empty — should show validation error
    const submitBtn = page.locator('button:has-text("Create Product")').last();
    await submitBtn.click();
    await settle(800);
    const formError = await page.locator('[role="alert"]').first().textContent().catch(() => null);
    log(`Create form validation: "${formError}"`);
    if (!formError || !formError.includes('required')) {
      defect(`Create form did not show expected validation error; got: "${formError}"`);
    }
    await shot('03_create_form_validation');

    // Cancel
    const cancelBtn = page.locator('button:has-text("Cancel")').first();
    if (await cancelBtn.count() > 0) {
      await cancelBtn.click();
      await settle(800);
      log('[step 3] create form cancelled');
      await shot('04_after_cancel');
    } else {
      defect('Cancel button not found in create form');
    }
  } else {
    log('Create Product button is disabled (RBAC gate active)');
    await shot('02_create_btn_disabled');
  }
}

// ---------------------------------------------------------------------------
// Step 4: Open first product detail panel
// ---------------------------------------------------------------------------
log('[step 4] open first product detail panel');
const detailBtns = page.locator('button:has-text("Details")');
const detailCount = await detailBtns.count();
log(`Found ${detailCount} Details buttons`);

if (detailCount === 0) {
  // Try clicking directly on a product card
  const cards = page.locator('.rounded-xl.border.cursor-pointer');
  if (await cards.count() > 0) {
    await cards.first().click();
    await settle(2000);
    await shot('05_product_selected_no_details_btn');
  } else {
    defect('No product cards found — portfolio may be empty');
    await shot('05_empty_portfolio');
  }
} else {
  await detailBtns.first().click({ force: true });
  await settle(2500);
  await shot('05_detail_panel_open');
}

// ---------------------------------------------------------------------------
// Step 5: Check detail panel sections
// ---------------------------------------------------------------------------
log('[step 5] inspect detail panel sections');

// Check Publish gate section
const publishGate = page.locator('h4:has-text("Publish gate"), h4:has-text("Publish Gate")');
if (await publishGate.count() > 0) {
  log('PublishGate section found');
  await shot('06_publish_gate');

  // Check gate checks
  const gateItems = await page.$$eval('ul li.flex', (els) =>
    els.map((e) => e.textContent?.trim().slice(0, 80)),
  );
  log(`Publish gate checks: ${JSON.stringify(gateItems)}`);

  // Check Publish button state
  const publishBtn = page.locator('button:has-text("Publish as data share")');
  if (await publishBtn.count() > 0) {
    const isDisabled = await publishBtn.isDisabled();
    log(`Publish button disabled=${isDisabled} (expected: true for uncleared gates)`);
    if (!isDisabled) {
      log('Publish button is enabled — opening confirm dialog then cancelling');
      await publishBtn.click();
      await settle(1000);
      const confirmDialog = page.locator('[role="dialog"], .dialog, [data-testid="confirm-dialog"]');
      if (await confirmDialog.count() > 0) {
        await shot('07_publish_confirm_dialog');
        const cancelConfirm = page.locator('button:has-text("Cancel")').last();
        if (await cancelConfirm.count() > 0) {
          await cancelConfirm.click();
          await settle(500);
          log('Publish confirm cancelled');
        }
      } else {
        // Check if inline confirm appeared
        await shot('07_publish_clicked_no_dialog');
        defect('Publish confirm dialog did not appear after clicking enabled Publish button');
      }
    }
  } else {
    // Product may already be published
    const publishedBadge = page.locator('span:has-text("Published")');
    if (await publishedBadge.count() > 0) {
      log('Product is already published — PublishGate shows "Published" badge');
    } else {
      defect('Publish button and "Published" badge both missing in PublishGate');
    }
  }
} else {
  defect('PublishGate section not found in detail panel');
  await shot('06_no_publish_gate');
}

// ---------------------------------------------------------------------------
// Step 6: Check KpiLifecyclePanel
// ---------------------------------------------------------------------------
log('[step 6] check KpiLifecyclePanel');
await page.evaluate(() => window.scrollBy(0, 300));
await settle(1500);
const kpiPanel = page.locator('h4:has-text("KPI"), section:has-text("KPI")').first();
const kpiPanelText = await page.content().then((c) => c.includes('KpiLifecycle') || c.includes('kpi') || c.includes('KPI'));
log(`KPI panel content in page: ${kpiPanelText}`);
await shot('08_kpi_lifecycle_area');

// ---------------------------------------------------------------------------
// Step 7: Check RecommendationsPanel
// ---------------------------------------------------------------------------
log('[step 7] check RecommendationsPanel');
await page.evaluate(() => window.scrollBy(0, 300));
await settle(1500);
await shot('09_recommendations_area');

const recText = await page.locator('text=/recommend/i').first().textContent().catch(() => null);
log(`Recommendations section text: "${recText}"`);

// ---------------------------------------------------------------------------
// Step 8: Check ProductActivityPanel
// ---------------------------------------------------------------------------
log('[step 8] check ProductActivityPanel');
await page.evaluate(() => window.scrollBy(0, 300));
await settle(1500);
await shot('10_activity_area');

// ---------------------------------------------------------------------------
// Step 9: Subscribe gating check
// ---------------------------------------------------------------------------
log('[step 9] check subscribe gating on product cards');
const subscribeBtns = page.locator('button:has-text("Subscribe")');
const subCount = await subscribeBtns.count();
log(`Found ${subCount} Subscribe buttons`);

for (let i = 0; i < Math.min(subCount, 3); i++) {
  const btn = subscribeBtns.nth(i);
  const disabled = await btn.isDisabled();
  const title = await btn.getAttribute('title');
  log(`Subscribe[${i}] disabled=${disabled} title="${title}"`);
}
await shot('11_subscribe_gating');

// ---------------------------------------------------------------------------
// Step 10: Open Object360 if a product is selected
// ---------------------------------------------------------------------------
log('[step 10] test Object360 panel');
const obj360Btn = page.locator('button:has-text("Object 360")');
if (await obj360Btn.count() > 0) {
  await obj360Btn.click();
  await settle(4000);
  await shot('12_object360_panel');
  // Close / navigate back
  const closeBtn = page.locator('button[aria-label="Close"], button:has-text("Close")').first();
  if (await closeBtn.count() > 0) {
    await closeBtn.click();
    await settle(1000);
    log('Object360 closed');
  }
} else {
  log('Object360 button not visible (no product selected or already closed)');
}

// ---------------------------------------------------------------------------
// Final screenshot + teardown
// ---------------------------------------------------------------------------
await page.evaluate(() => window.scrollTo(0, 0));
await settle(500);
await shot('13_final_state');

await browser.close();

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const report = {
  url: `${BASE}/data-products`,
  kpiValues,
  steps: findings.steps,
  defects: findings.defects,
  consoleErrors: findings.consoleErrors,
  networkErrors: findings.networkErrors,
  network4xx: findings.network4xx,
};

const reportPath = path.join(SCREEN_DIR, 'findings.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log('\n=== REPORT ===');
console.log(JSON.stringify(report, null, 2));
