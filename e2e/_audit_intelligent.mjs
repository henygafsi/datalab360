/**
 * READ-ONLY Playwright audit: /intelligent module
 * Run: node e2e/_audit_intelligent.mjs (from repo root)
 * Time-boxed: ~90s navigation
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_STATE = resolve(__dirname, '.auth/state.json');

const TABS = [
  'semantic-models',
  'ai-console',
  'cortex-chat',
  'ai-advisor',
  'ml-features',
  'advanced-ml',
  'query-analytics',
  'local-analytics',
  'snowpark-services',
  'cortex-agents',
  'semantic-views',
  'vector-search',
];

const results = {
  pagesOk: [],
  pagesWarming: [],
  pagesError: [],
  consoleErrors: [],
  networkErrors5xx: [],
  actionButtons: [],
  ungatedActions: [],
  permissionGatedActions: [],
  approvalSurfaces: [],
  transparencyGaps: [],
  uxGaps: [],
  vendorLeaks: [],
};

// WARMING / CACHE phrases
const WARMING_PHRASES = [
  'warming up', 'cache is initializing', 'initializing cache',
  'loading cache', 'cache warming', 'wait a moment',
];
const REAL_DATA_PHRASES = [
  'semantic model', 'model', 'query', 'no data', 'no results',
  'empty', 'error', 'failed', 'retry',
];

function isWarmingPage(text) {
  const lower = text.toLowerCase();
  return WARMING_PHRASES.some((p) => lower.includes(p));
}

async function waitForNetworkIdle(page, timeout = 5000) {
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch {
    // timeout is fine — move on
  }
}

async function auditTab(page, tab, baseUrl) {
  const url = `${baseUrl}/intelligent?tab=${tab}`;
  const tabErrors = [];
  const tab5xx = [];

  // Capture console errors for this tab
  const consoleHandler = (msg) => {
    if (msg.type() === 'error') {
      tabErrors.push(`[${tab}] ${msg.text()}`);
    }
  };
  // Capture 5xx responses
  const responseHandler = (response) => {
    if (response.status() >= 500) {
      tab5xx.push(`[${tab}] ${response.status()} ${response.url()}`);
    }
  };

  page.on('console', consoleHandler);
  page.on('response', responseHandler);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await waitForNetworkIdle(page, 5000);

  // Check auth redirect
  const finalUrl = page.url();
  if (finalUrl.includes('/signin') || finalUrl.includes('/login')) {
    results.pagesError.push(`${tab}: redirected to signin (not authed)`);
    page.off('console', consoleHandler);
    page.off('response', responseHandler);
    return;
  }

  // Get page text for warming/data checks
  const bodyText = await page.evaluate(() => document.body.innerText);
  if (isWarmingPage(bodyText)) {
    results.pagesWarming.push(tab);
  } else {
    results.pagesOk.push(tab);
  }

  // Record errors
  results.consoleErrors.push(...tabErrors);
  results.networkErrors5xx.push(...tab5xx);

  page.off('console', consoleHandler);
  page.off('response', responseHandler);

  return bodyText;
}

async function enumerateActionButtons(page, tab) {
  // Find all visible buttons and interactive elements
  const buttons = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button, [role="button"], [type="submit"]'));
    return els.map((el) => {
      const text = (el.innerText || el.getAttribute('aria-label') || el.title || '').trim().slice(0, 80);
      const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled');
      const hasTitle = !!el.title;
      const title = (el.title || '').trim().slice(0, 120);
      const visible = el.offsetParent !== null;
      return { text, disabled, hasTitle, title, visible };
    }).filter((b) => b.visible && b.text.length > 0);
  });

  // Classify buttons
  const MUTATING_KEYWORDS = [
    'create', 'delete', 'edit', 'save', 'update', 'generate', 'deploy',
    'run', 'apply', 'publish', 'send', 'analyze', 'train', 'predict',
    'acknowledge', 'resolve', 'dismiss', 'revoke', 'grant', 'approve',
    'deny', 'suspend', 'resume', 'drop', 'upload', 'import',
    'new conversation', 'clear',
  ];

  for (const btn of buttons) {
    const lowerText = btn.text.toLowerCase();
    const isMutating = MUTATING_KEYWORDS.some((kw) => lowerText.includes(kw));
    if (!isMutating) continue;

    const entry = { tab, text: btn.text, disabled: btn.disabled, tooltip: btn.title };
    results.actionButtons.push(entry);

    // Is it permission-gated? Check for permission-related tooltip
    const hasPermTooltip = btn.title.toLowerCase().includes('permission') || btn.title.toLowerCase().includes('lack');
    const hasDisabledForPermission = btn.disabled && hasPermTooltip;

    if (!btn.disabled && !hasPermTooltip) {
      // Enabled button with no permission tooltip — potentially ungated
      results.ungatedActions.push({ tab, text: btn.text });
    } else if (hasDisabledForPermission || hasPermTooltip) {
      results.permissionGatedActions.push({ tab, text: btn.text, tooltip: btn.title });
    }
  }
}

async function tryOpenModal(page, tab, buttonText) {
  // Only try safe non-destructive actions: "Create Model", "Refresh", "View / Edit"
  const SAFE_TO_OPEN = ['create model', 'create your first model', 'view / edit'];
  if (!SAFE_TO_OPEN.some((s) => buttonText.toLowerCase().includes(s))) return;

  try {
    const btn = page.locator(`button:has-text("${buttonText}")`).first();
    const count = await btn.count();
    if (count === 0) return;
    const isDisabled = await btn.evaluate((el) => el.disabled || el.getAttribute('aria-disabled') === 'true');
    if (isDisabled) return;

    await btn.hover({ timeout: 2000 });
    await btn.click({ timeout: 3000 });
    // Wait briefly for modal/panel to open
    await page.waitForTimeout(1000);

    // Check if a panel or modal appeared
    const panelVisible = await page.locator('[class*="RightTabPanel"], [class*="modal"], [role="dialog"]').count();
    if (panelVisible > 0) {
      results.uxGaps.push(`[SAFE-OPEN] ${tab}: "${buttonText}" opened a panel/modal — confirmed interactive`);
    }

    // Try to cancel/close
    const cancelBtn = page.locator('button:has-text("Cancel"), button:has-text("Close")').first();
    if (await cancelBtn.count() > 0) {
      await cancelBtn.click({ timeout: 2000 });
    } else {
      // Press Escape
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(500);
  } catch (err) {
    // Non-critical
  }
}

async function checkVendorLeaks(page, tab) {
  const text = await page.evaluate(() => document.body.innerText);
  const vendor_patterns = [
    { pattern: /\bsnowflake\b/i, name: 'Snowflake' },
    { pattern: /\bcortex\b/i, name: 'Cortex' },
    { pattern: /\bkimi\b/i, name: 'Kimi' },
  ];

  for (const { pattern, name } of vendor_patterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      // Check context — we allow in admin/technical views but not in main UI copy
      results.vendorLeaks.push(`[${tab}] "${name}" appears in page text`);
    }
  }
}

async function checkDarkModeIssues(page, tab) {
  // Quick check: does the page have dark: classes?
  const hasDarkClasses = await page.evaluate(() => {
    const els = document.querySelectorAll('[class*="dark:"]');
    return els.length > 0;
  });
  if (!hasDarkClasses) {
    results.uxGaps.push(`[${tab}] No dark: Tailwind classes found — potential dark mode gap`);
  }
}

async function check4States(page, tab, bodyText) {
  // 4 states: loading, empty, error, data
  const hasLoading = bodyText.toLowerCase().includes('loading') || bodyText.toLowerCase().includes('…');
  const hasEmpty = bodyText.toLowerCase().includes('no ') || bodyText.toLowerCase().includes('not found') || bodyText.toLowerCase().includes('yet');
  const hasError = bodyText.toLowerCase().includes('error') || bodyText.toLowerCase().includes('failed') || bodyText.toLowerCase().includes('retry');
  const hasData = !isWarmingPage(bodyText);

  // We can only really check what's rendered now
  if (!hasLoading && !hasEmpty && !hasError && !hasData) {
    results.uxGaps.push(`[${tab}] Cannot confirm 4-state coverage (loading/empty/error/data)`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: AUTH_STATE,
  });
  const page = await context.newPage();
  const baseUrl = 'http://localhost:3000';

  // Global 5xx + console error capture
  const global5xx = [];
  const globalConsoleErrors = [];

  page.on('response', (r) => {
    if (r.status() >= 500) global5xx.push(`${r.status()} ${r.url()}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') globalConsoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    globalConsoleErrors.push(`[PAGE ERROR] ${err.message}`);
  });

  // ── 1. Initial load of /intelligent (default tab = semantic-models) ──
  console.log('Loading /intelligent...');
  await page.goto(`${baseUrl}/intelligent`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await waitForNetworkIdle(page, 6000);

  const finalUrl = page.url();
  console.log(`Final URL: ${finalUrl}`);
  if (finalUrl.includes('/signin') || finalUrl.includes('/login')) {
    console.error('NOT AUTHED — redirected to signin');
    results.pagesError.push('/ intelligent: not authed, redirected to signin');
  }

  // ── 2. Walk each tab ──
  for (const tab of TABS) {
    console.log(`Auditing tab: ${tab}`);
    const bodyText = await auditTab(page, tab, baseUrl);
    if (bodyText) {
      await enumerateActionButtons(page, tab);
      await checkVendorLeaks(page, tab);
      await checkDarkModeIssues(page, tab);
      await check4States(page, tab, bodyText);
    }
    // Small pause between tabs
    await page.waitForTimeout(800);
  }

  // ── 3. Revisit semantic-models and try opening the Create panel (safe) ──
  console.log('Revisiting semantic-models to test Create panel...');
  await page.goto(`${baseUrl}/intelligent?tab=semantic-models`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await waitForNetworkIdle(page, 4000);
  await tryOpenModal(page, 'semantic-models', 'Create Model');
  await page.waitForTimeout(500);

  // ── 4. Check for "View / Edit" on any listed models ──
  const modelCards = await page.locator('button:has-text("View / Edit")').count();
  if (modelCards > 0) {
    console.log(`Found ${modelCards} "View / Edit" button(s) — trying hover...`);
    await page.locator('button:has-text("View / Edit")').first().hover({ timeout: 2000 });
    results.uxGaps.push(`[semantic-models] ${modelCards} model(s) listed with View/Edit buttons — real data present`);
  }

  // ── 5. Collect all 5xx and console errors ──
  results.networkErrors5xx.push(...global5xx);
  results.consoleErrors.push(...globalConsoleErrors);

  await browser.close();

  // ── 6. Print summary ──
  console.log('\n=== AUDIT RESULTS ===');
  console.log('Pages OK:', results.pagesOk);
  console.log('Pages Warming:', results.pagesWarming);
  console.log('Pages Error:', results.pagesError);
  console.log('5xx errors:', results.networkErrors5xx.slice(0, 20));
  console.log('Console errors:', results.consoleErrors.slice(0, 20));
  console.log('Action buttons found:', results.actionButtons.length);
  console.log('Ungated actions:', results.ungatedActions);
  console.log('Gated actions:', results.permissionGatedActions);
  console.log('Vendor leaks:', results.vendorLeaks);
  console.log('UX gaps:', results.uxGaps);

  // Output as JSON for parsing
  console.log('\n=== JSON OUTPUT ===');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
