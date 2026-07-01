/**
 * READ-ONLY authenticated Playwright audit — data-products module.
 * Uses saved auth state (HAHA / ACCOUNTADMIN).
 * Does NOT submit any form — opens modals/confirms and cancels.
 */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const STORAGE = 'e2e/.auth/state.json';
const ROUTE = '/data-products';
const TIMEOUT_MS = 90_000;

const findings = {
  pages_ok: 0,
  pages_warming: 0,
  pages_error: 0,
  consoleErrors: [],
  networkErrors: [],   // 5xx
  network4xx: [],      // 4xx (informational)
  actions: [],         // buttons discovered
  ungated: [],         // mutating without visible perm gate
  gated: [],           // mutating with explicit perm gate
  approval_surfaces: [],
  transparency_gaps: [],
  ux_gaps: [],
  raw_log: [],
};

function log(msg) { findings.raw_log.push(msg); console.log(msg); }

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: STORAGE,
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();

// ---------- telemetry hooks ----------
page.on('pageerror', (err) => {
  const msg = (err?.message || String(err)).slice(0, 200);
  findings.consoleErrors.push(msg);
  log(`[pageerror] ${msg}`);
});
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    const txt = msg.text().slice(0, 200);
    findings.consoleErrors.push(`console.error: ${txt}`);
  }
});
page.on('response', (r) => {
  const url = r.url().replace(BASE, '');
  const s = r.status();
  if (s >= 500) findings.networkErrors.push(`${s} ${url.split('?')[0]}`);
  else if (s >= 400 && !/(\.png|\.jpg|\.svg|\.woff|\.ico|favicon)/.test(url))
    findings.network4xx.push(`${s} ${url.split('?')[0]}`);
});

// ---------- helpers ----------
async function waitForSettle(ms = 7000) { await page.waitForTimeout(ms); }

async function bodyText() {
  return (await page.locator('body').innerText().catch(() => '')).toLowerCase();
}

async function isOnSignin() { return page.url().includes('/signin'); }

async function checkWarmup(text) {
  return /(warming up|cache is initializing|cache not ready|loading\.\.\.)/.test(text);
}

// ---------- MAIN ----------
log(`\n=== DATA-PRODUCTS AUDIT ===`);
log(`Auth: ${STORAGE} | Target: ${BASE}${ROUTE}`);

// Navigate
await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
await waitForSettle(8000); // let dev compile + data load

// 1. Auth check
if (await isOnSignin()) {
  log('FAIL: redirected to /signin — auth expired');
  findings.pages_error++;
  await browser.close();
  console.log(JSON.stringify(findings, null, 2));
  process.exit(1);
}
log(`URL after load: ${page.url()}`);

// 2. Warm-up check
const bt = await bodyText();
if (await checkWarmup(bt)) {
  log('WARN: page shows warming-up / cache-not-ready message');
  findings.pages_warming++;
} else {
  log('OK: no warming-up banner detected');
}

// 3. Error boundary check
if (/(something went wrong|encountered a rendering error|an error occurred while loading)/.test(bt)) {
  findings.pages_error++;
  log('FAIL: error boundary rendered');
} else {
  findings.pages_ok++;
  log('OK: page rendered without error boundary');
}

// 4. Real data check — look for product cards or "no products" empty state
const cardCount = await page.locator('[class*="rounded-xl"][class*="border"]').count().catch(() => 0);
log(`Card-like elements found: ${cardCount}`);

// 5. Enumerate KPI tiles
const kpiTiles = await page.locator('text=/Data Products|Certified|Avg Quality|Consumers|Domains|Trust Score/').all().catch(() => []);
log(`KPI tiles visible: ${kpiTiles.length}`);

// Check for dash placeholders vs real numbers in KPI
const kpiSection = await page.locator('.grid').first().innerText().catch(() => '');
const hasRealNumbers = /\d/.test(kpiSection);
log(`KPI section has real numbers: ${hasRealNumbers}`);

// ---- ACTION BUTTONS ----
// 6. Header-level buttons
const createProductBtn = page.locator('button:has-text("Create Product")');
const createCount = await createProductBtn.count();
log(`\n[ACTIONS] "Create Product" buttons: ${createCount}`);
if (createCount > 0) {
  const isDisabled = await createProductBtn.first().isDisabled();
  const title = await createProductBtn.first().getAttribute('title');
  findings.actions.push({ label: 'Create Product', disabled: isDisabled, title });
  if (isDisabled && title?.includes('permission')) {
    findings.gated.push('Create Product — disabled with permission message');
    log(`  GATED: Create Product disabled (${title})`);
  } else if (!isDisabled) {
    // ACCOUNTADMIN — should be allowed, click to open inline form then cancel
    log(`  Clicking "Create Product" to open inline form…`);
    await createProductBtn.first().click();
    await page.waitForTimeout(1000);
    // Check form appeared
    const formHeader = await page.locator('text=New Data Product').count().catch(() => 0);
    log(`  Inline create form visible: ${formHeader > 0}`);
    if (formHeader > 0) {
      // Cancel — find X or Cancel button in the form
      const cancelBtn = page.locator('button:has-text("Cancel")').first();
      const cancelCount = await cancelBtn.count();
      if (cancelCount > 0) { await cancelBtn.click(); await page.waitForTimeout(500); log('  Form cancelled OK'); }
    }
  }
}

const manageAccessBtn = page.locator('button:has-text("Manage Access"), button:has-text("Access")');
const manageAccessCount = await manageAccessBtn.count();
log(`\n[ACTIONS] "Manage Access" buttons: ${manageAccessCount}`);
if (manageAccessCount > 0) {
  findings.actions.push({ label: 'Manage Access', area: 'header' });
  findings.approval_surfaces.push('ManageAccessButton — module-level access on Product Portfolio page');
}

const refreshBtn = page.locator('button:has-text("Refresh")').first();
const refreshCount = await page.locator('button:has-text("Refresh")').count();
log(`[ACTIONS] "Refresh" buttons: ${refreshCount}`);
if (refreshCount > 0) {
  findings.actions.push({ label: 'Refresh (data reload)', area: 'header', mutating: false });
}

// 7. Click first product card to open detail panel
log('\n[INTERACTION] Looking for product cards...');
// Product cards have cursor-pointer class
const productCards = page.locator('[class*="cursor-pointer"][class*="rounded-xl"]');
const productCardCount = await productCards.count().catch(() => 0);
log(`Product cards found: ${productCardCount}`);

let selectedProductName = null;
if (productCardCount > 0) {
  // Click first card
  await productCards.first().click();
  await page.waitForTimeout(2000);

  // Verify detail panel opened (right rail w-[380px])
  const detailPanel = page.locator('[class*="w-\\[380px\\]"], [class*="ProductDetailPanel"], div:has(button:has-text("Object 360"))');
  const detailCount = await detailPanel.count().catch(() => 0);
  log(`Detail panel opened: ${detailCount > 0}`);

  // Get product name from detail panel header
  const detailH3 = page.locator('div[class*="p-5"] h3').first();
  selectedProductName = await detailH3.innerText().catch(() => null);
  log(`Selected product: ${selectedProductName}`);

  // 8. Enumerate actions in detail panel
  // Object 360 button
  const obj360Btn = page.locator('button:has-text("Object 360")');
  const obj360Count = await obj360Btn.count();
  log(`\n[ACTIONS] "Object 360" button: ${obj360Count}`);
  if (obj360Count > 0) {
    findings.actions.push({ label: 'Object 360', area: 'detail-panel', mutating: false });
    // Click to open, then close
    await obj360Btn.first().click();
    await page.waitForTimeout(1500);
    const obj360Panel = page.locator('[class*="Object360Panel"], div:has(button:has-text("Close"))');
    const obj360PanelCount = await obj360Panel.count();
    log(`  Object360Panel opened: ${obj360PanelCount > 0}`);
    // Close it
    const closeBtn = page.locator('button[aria-label="Close"], button:has-text("×"), button:has([class*="X"])').first();
    const closeBtnX = page.locator('button').filter({ has: page.locator('svg[class*="h-4"]') }).first();
    // Try to go back by pressing Escape or clicking close
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    // Re-select product card
    await productCards.first().click();
    await page.waitForTimeout(1500);
  }

  // Publish gate section
  const publishGateSection = page.locator('text=Publish gate');
  const publishGateCount = await publishGateSection.count();
  log(`\n[ACTIONS] "Publish gate" section visible: ${publishGateCount > 0}`);
  if (publishGateCount > 0) {
    findings.actions.push({ label: 'Publish as data share (PublishGate)', area: 'detail-panel', mutating: true });
    findings.approval_surfaces.push('PublishGate — quality/governance/lineage threshold gate before publish');

    // Check if Publish button is present and what state it's in
    const publishBtn = page.locator('button:has-text("Publish as data share")');
    const publishBtnCount = await publishBtn.count();
    log(`  "Publish as data share" button: ${publishBtnCount}`);
    if (publishBtnCount > 0) {
      const isDisabled = await publishBtn.first().isDisabled();
      const title = await publishBtn.first().getAttribute('title');
      log(`  Publish button disabled: ${isDisabled}, title: ${title}`);
      if (!isDisabled) {
        // Hover to check tooltip
        await publishBtn.first().hover();
        await page.waitForTimeout(500);
        // Don't click — would open ConfirmDialog which we should cancel
        // Actually let's open and cancel to check
        await publishBtn.first().click();
        await page.waitForTimeout(500);
        const confirmDialog = page.locator('[role="dialog"], [class*="ConfirmDialog"]');
        const confirmCount = await confirmDialog.count();
        log(`  ConfirmDialog appeared: ${confirmCount > 0}`);
        if (confirmCount > 0) {
          findings.approval_surfaces.push('Publish — requires ConfirmDialog confirmation before executing');
          // Cancel
          const cancelInDialog = page.locator('[role="dialog"] button:has-text("Cancel"), button:has-text("Cancel")').last();
          await cancelInDialog.click().catch(async () => await page.keyboard.press('Escape'));
          await page.waitForTimeout(500);
          log('  ConfirmDialog cancelled OK');
        }
      } else {
        if (title?.includes('permission')) {
          findings.gated.push('Publish as data share — disabled by missing permission');
        } else {
          findings.gated.push('Publish as data share — disabled by gate checks (quality/governance/lineage thresholds)');
        }
      }
    }
  }

  // Lifecycle actions section
  const lifecycleSection = page.locator('text=Lifecycle actions');
  const lifecycleCount = await lifecycleSection.count();
  log(`\n[ACTIONS] "Lifecycle actions" section visible: ${lifecycleCount > 0}`);

  if (lifecycleCount > 0) {
    // Refresh data button
    const refreshDataBtn = page.locator('button:has-text("Refresh data")');
    const refreshDataCount = await refreshDataBtn.count();
    log(`  "Refresh data" button: ${refreshDataCount}`);
    if (refreshDataCount > 0) {
      const isDisabled = await refreshDataBtn.first().isDisabled();
      const title = await refreshDataBtn.first().getAttribute('title');
      findings.actions.push({ label: 'Refresh data', area: 'lifecycle-actions', mutating: true, disabled: isDisabled });
      if (!isDisabled) {
        // Click to open confirm dialog
        await refreshDataBtn.first().click();
        await page.waitForTimeout(500);
        const confirmDialog = page.locator('[role="dialog"], [class*="ConfirmDialog"]');
        const confirmCount = await confirmDialog.count();
        log(`  Refresh ConfirmDialog: ${confirmCount > 0}`);
        if (confirmCount > 0) {
          findings.approval_surfaces.push('Refresh data — requires ConfirmDialog confirmation');
          const cancelBtn2 = page.locator('[role="dialog"] button:has-text("Cancel"), button:has-text("Cancel")').last();
          await cancelBtn2.click().catch(async () => await page.keyboard.press('Escape'));
          await page.waitForTimeout(500);
          log('  Refresh ConfirmDialog cancelled OK');
        }
      }
    }

    // Manage subscribers button
    const manageSubs = page.locator('button:has-text("Manage subscribers")');
    const manageSubsCount = await manageSubs.count();
    log(`  "Manage subscribers" button: ${manageSubsCount}`);
    if (manageSubsCount > 0) {
      findings.actions.push({ label: 'Manage subscribers (toggle)', area: 'lifecycle-actions', mutating: false });
      await manageSubs.first().click();
      await page.waitForTimeout(2000);
      // Check if subscribers section expanded
      const subSection = page.locator('text=Subscribers');
      const subCount = await subSection.count();
      log(`  Subscribers section expanded: ${subCount > 0}`);
      // Check for "Subscribe my account" button
      const subscribeMyAcct = page.locator('button:has-text("Subscribe my account")');
      const subscribeMyAcctCount = await subscribeMyAcct.count();
      log(`  "Subscribe my account" button: ${subscribeMyAcctCount}`);
      if (subscribeMyAcctCount > 0) {
        const isDisabled = await subscribeMyAcct.first().isDisabled();
        const title = await subscribeMyAcct.first().getAttribute('title');
        findings.actions.push({ label: 'Subscribe my account', area: 'lifecycle-actions-expanded', mutating: true, disabled: isDisabled });
        if (isDisabled) {
          findings.gated.push(`Subscribe my account — disabled (${title || 'no title'})`);
          log(`  Subscribe disabled: ${title}`);
        }
      }
    }

    // View lineage button
    const viewLineage = page.locator('button:has-text("View lineage")');
    const viewLineageCount = await viewLineage.count();
    log(`  "View lineage" button: ${viewLineageCount}`);
    if (viewLineageCount > 0) {
      findings.actions.push({ label: 'View lineage (toggle)', area: 'lifecycle-actions', mutating: false });
      await viewLineage.first().click();
      await page.waitForTimeout(2000);
      log('  Lineage expanded');
    }
  }

  // KPI Lifecycle Panel
  const kpiSection2 = page.locator('text=KPI').first();
  const kpiSectionCount = await page.locator('text=/KPI|kpi/i').count().catch(() => 0);
  log(`\n[ACTIONS] KPI lifecycle section elements: ${kpiSectionCount}`);
  // Add KPI button
  const addKpiBtn = page.locator('button:has-text("Add KPI"), button[aria-label*="KPI"]');
  const addKpiBtnCount = await addKpiBtn.count();
  log(`  "Add KPI" button: ${addKpiBtnCount}`);
  if (addKpiBtnCount > 0) {
    const isDisabled = await addKpiBtn.first().isDisabled();
    findings.actions.push({ label: 'Add KPI', area: 'kpi-lifecycle', mutating: true, disabled: isDisabled });
  }

  // Generate KPIs button
  const generateKpi = page.locator('button:has-text("Generate"), button:has-text("Auto")');
  const generateKpiCount = await generateKpi.count();
  log(`  "Generate KPIs" buttons: ${generateKpiCount}`);
  if (generateKpiCount > 0) {
    findings.actions.push({ label: 'Generate KPIs (AI)', area: 'kpi-lifecycle', mutating: true });
  }

  // Recommendations section
  const recoSection = page.locator('text=Recommendations, text=Recommend');
  const recoCount = await page.locator('text=/[Rr]ecommendation/').count().catch(() => 0);
  log(`\n[ACTIONS] Recommendations section elements: ${recoCount}`);
  const applyBtn = page.locator('button:has-text("Apply")');
  const applyCount = await applyBtn.count();
  log(`  "Apply" (recommendations) buttons: ${applyCount}`);
  if (applyCount > 0) {
    findings.actions.push({ label: 'Apply recommendation', area: 'recommendations', mutating: true });
  }
}

// 9. Subscribe button on cards
const subscribeCardBtns = page.locator('button:has-text("Subscribe")');
const subscribeCardCount = await subscribeCardBtns.count();
log(`\n[ACTIONS] "Subscribe" buttons (on cards): ${subscribeCardCount}`);
if (subscribeCardCount > 0) {
  const firstDisabled = await subscribeCardBtns.first().isDisabled();
  const firstTitle = await subscribeCardBtns.first().getAttribute('title');
  findings.actions.push({ label: 'Subscribe (card)', mutating: true, disabled: firstDisabled, title: firstTitle });
  if (firstDisabled && firstTitle) {
    findings.gated.push(`Subscribe (card) — disabled: ${firstTitle}`);
    log(`  First Subscribe disabled: ${firstTitle}`);
  }
}

// 10. Details button on cards
const detailsBtns = page.locator('button:has-text("Details")');
const detailsCount = await detailsBtns.count();
log(`[ACTIONS] "Details" buttons (on cards): ${detailsCount}`);
if (detailsCount > 0) {
  findings.actions.push({ label: 'Details (open right rail)', mutating: false });
}

// 11. Explore links on cards (anchor tags)
const exploreLinks = page.locator('a:has-text("Explore")');
const exploreCount = await exploreLinks.count();
log(`[ACTIONS] "Explore" cross-module links: ${exploreCount}`);
if (exploreCount > 0) {
  findings.actions.push({ label: 'Explore (cross-module link to /explore-design)', mutating: false });
}

// ---- TRANSPARENCY & UX CHECKS ----
log('\n[UX / TRANSPARENCY CHECKS]');

// 12. Check for vendor name leaks (Snowflake, Cortex, Kimi)
const fullBodyText = await page.locator('body').innerText().catch(() => '');
const vendorLeaks = [];
if (/snowflake/i.test(fullBodyText)) {
  // Only flag if not in admin/architecture context
  const snowflakeMatches = [...fullBodyText.matchAll(/snowflake/gi)].length;
  if (snowflakeMatches > 0) {
    vendorLeaks.push(`"Snowflake" appears ${snowflakeMatches}x in body text`);
  }
}
if (/cortex/i.test(fullBodyText)) vendorLeaks.push('"Cortex" appears in body text');
if (/kimi/i.test(fullBodyText)) vendorLeaks.push('"Kimi" appears in body text');
for (const v of vendorLeaks) {
  findings.ux_gaps.push(`Brand leak: ${v}`);
  log(`  [BRAND LEAK] ${v}`);
}
if (vendorLeaks.length === 0) log('  No vendor name leaks detected in visible text');

// 13. Check for empty-state (no products)
const emptyState = await page.locator('text=/No data products yet|No products match/').count();
log(`Empty state visible: ${emptyState > 0 ? 'yes' : 'no'}`);

// 14. Status filter check
const statusFilter = page.locator('select[aria-label="Filter by status"]');
const statusFilterCount = await statusFilter.count();
log(`Status filter dropdown: ${statusFilterCount > 0 ? 'present' : 'missing'}`);
if (statusFilterCount > 0) {
  // Check options
  const options = await statusFilter.locator('option').allInnerTexts();
  log(`  Filter options: ${options.join(', ')}`);
  findings.approval_surfaces.push(`Status filter (${options.join('/')})`);
}

// 15. Search field
const searchInput = page.locator('input[aria-label="Search products"]');
const searchCount = await searchInput.count();
log(`Search field: ${searchCount > 0 ? 'present' : 'missing'}`);
if (searchCount === 0) findings.ux_gaps.push('Search input missing or aria-label mismatch');

// 16. Check cross-module footer links
const crossLinks = await page.locator('footer a, [class*="border-t"] a').allInnerTexts().catch(() => []);
log(`Cross-module links: ${crossLinks.join(' | ')}`);

// 17. Loading state — check skeleton placeholders aren't stuck
const skeleton = await page.locator('[class*="animate-pulse"]').count();
log(`Skeleton/loading placeholders still showing: ${skeleton}`);
if (skeleton > 0) {
  findings.ux_gaps.push(`${skeleton} skeleton loaders still visible after 8s — data may not have loaded`);
}

// 18. Dark mode — cannot test headless but note Tailwind dark: classes in source
log('Dark mode: classes present in source (dark:bg-gray-900, dark:text-white etc) — cannot verify headless');
findings.ux_gaps.push('Dark mode: verified via source code only — no headless test possible; Tailwind dark: classes present throughout page.tsx');

// 19. Check for 4-state coverage (loading/empty/error/data)
log('[4-STATE] Loading: skeleton via animate-pulse | Empty: "No data products yet" | Error: red alert box + Retry | Data: product cards');
// All 4 states are handled in source — no gap from code review

// ---- SUMMARIZE ----
log('\n=== SUMMARY ===');
log(`5xx errors: ${findings.networkErrors.length}`);
for (const e of findings.networkErrors) log(`  ${e}`);
log(`4xx responses: ${findings.network4xx.length}`);
for (const e of findings.network4xx.slice(0, 10)) log(`  ${e}`);
log(`Console/page errors: ${findings.consoleErrors.length}`);
for (const e of findings.consoleErrors.slice(0, 5)) log(`  ${e}`);
log(`Actions found: ${findings.actions.length}`);
for (const a of findings.actions) log(`  [${a.mutating ? 'MUT' : 'RO '}] ${a.label}${a.disabled ? ' [DISABLED]' : ''}`);
log(`Gated: ${findings.gated.length}`);
for (const g of findings.gated) log(`  ${g}`);
log(`Approval surfaces: ${findings.approval_surfaces.length}`);
for (const s of findings.approval_surfaces) log(`  ${s}`);
log(`UX gaps: ${findings.ux_gaps.length}`);
for (const g of findings.ux_gaps) log(`  ${g}`);
log(`Transparency gaps: ${findings.transparency_gaps.length}`);

await browser.close();
console.log('\n=== RAW FINDINGS JSON ===');
console.log(JSON.stringify({
  pages_ok: findings.pages_ok,
  pages_warming: findings.pages_warming,
  pages_error: findings.pages_error,
  network_5xx: findings.networkErrors,
  network_4xx: findings.network4xx.slice(0, 15),
  console_errors: findings.consoleErrors.slice(0, 10),
  actions_count: findings.actions.length,
  actions: findings.actions,
  gated: findings.gated,
  approval_surfaces: findings.approval_surfaces,
  transparency_gaps: findings.transparency_gaps,
  ux_gaps: findings.ux_gaps,
}, null, 2));
