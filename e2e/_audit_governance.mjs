// Governance module read-only Playwright audit
// Covers: /governance/policies, /governance/roles, /governance/users,
//         /governance/grants, /governance/security-matrix, /governance/oauth
// Auth: e2e/.auth/state.json (HAHA / ACCOUNTADMIN)
// Run: node e2e/_audit_governance.mjs

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE = path.join(__dirname, '.auth', 'state.json');
const BASE = 'http://localhost:3000';

const ROUTES = [
  '/governance/policies',
  '/governance/roles',
  '/governance/users',
  '/governance/grants',
  '/governance/security-matrix',
  '/governance/oauth',
];

const WARMING_PATTERNS = [
  /warming up/i,
  /cache is initializing/i,
  /cache not ready/i,
  /loading data/i,
  /preparing/i,
];

const findings = {
  pages: [],
  errors5xx: [],
  consoleErrors: [],
  actions: [],
  ungatedActions: [],
  approvalSurfaces: [],
  transparencyGaps: [],
  uxGaps: [],
};

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function auditPage(page, route) {
  const url = BASE + route;
  const pageErrors = [];
  const networkErrors5xx = [];
  const consoleErrs = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      // skip browser extension noise
      if (!txt.includes('chrome-extension') && !txt.includes('favicon')) {
        consoleErrs.push(txt.slice(0, 200));
      }
    }
  });

  page.on('pageerror', err => {
    pageErrors.push(err.message.slice(0, 200));
  });

  page.on('response', resp => {
    const s = resp.status();
    if (s >= 500) {
      networkErrors5xx.push({ status: s, url: resp.url().replace(BASE, '') });
    }
  });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  // Check auth redirect
  const finalUrl = page.url();
  const redirectedToSignin = finalUrl.includes('/signin') || finalUrl.includes('/login');

  // Check for warming/loading placeholders
  const bodyText = await page.evaluate(() => document.body.innerText);
  const warming = WARMING_PATTERNS.some(p => p.test(bodyText));

  // Discover tabs
  const tabButtons = await page.$$eval(
    '[role="tab"], button[data-tab], .tab-btn, [aria-selected]',
    els => els.map(el => ({
      text: el.textContent?.trim().slice(0, 60),
      ariaSelected: el.getAttribute('aria-selected'),
      dataTab: el.getAttribute('data-tab'),
    })).filter(t => t.text && t.text.length > 0)
  );

  // Discover ?tab= params via URL query buttons
  const tabLinks = await page.$$eval(
    'a[href*="?tab="], button[data-value]',
    els => els.map(el => ({
      text: el.textContent?.trim().slice(0, 60),
      href: el.getAttribute('href') || el.getAttribute('data-value'),
    })).filter(t => t.text)
  );

  // Enumerate mutating action buttons
  const actionBtns = await page.$$eval(
    'button, a[role="button"]',
    els => els.map(el => {
      const txt = el.textContent?.trim().toLowerCase() || '';
      const mutating = ['create', 'add', 'new', 'edit', 'update', 'delete', 'remove',
        'grant', 'revoke', 'approve', 'deny', 'apply', 'publish', 'run', 'deploy', 'sync',
        'generate', 'register', 'save', 'submit'].some(kw => txt.includes(kw));
      if (!mutating) return null;
      return {
        text: el.textContent?.trim().slice(0, 80),
        disabled: el.hasAttribute('disabled'),
        title: el.getAttribute('title') || '',
        ariaLabel: el.getAttribute('aria-label') || '',
      };
    }).filter(Boolean)
  );

  // Check for "warming" or empty state on key data-rendering areas
  const hasRealData = await page.evaluate(() => {
    const tables = document.querySelectorAll('table tbody tr, [data-testid="row"], .data-row');
    const cards = document.querySelectorAll('[class*="card"], [class*="panel"], [class*="item"]');
    return tables.length > 0 || cards.length > 5;
  });

  // Check for vendor name leaks in visible text
  const vendorLeaks = [];
  const visibleText = await page.evaluate(() => document.body.innerText);
  // Check for "Snowflake" in user-facing context (not code snippets / admin-only areas)
  const snowflakeMatches = [...visibleText.matchAll(/Snowflake/g)].length;
  if (snowflakeMatches > 0) {
    vendorLeaks.push(`"Snowflake" visible ${snowflakeMatches}x on ${route}`);
  }
  if (/Cortex/i.test(visibleText)) vendorLeaks.push(`"Cortex" visible on ${route}`);
  if (/Kimi/i.test(visibleText)) vendorLeaks.push(`"Kimi" visible on ${route}`);

  // Check for 4-state coverage: loading / empty / error / data
  const hasLoadingState = await page.$('[class*="skeleton"], [class*="spinner"], [class*="loading"]') !== null;
  const hasEmptyState = /no (data|records|results|items|roles|users|policies)/i.test(visibleText) ||
    /empty/i.test(visibleText);

  // Check for dark mode classes
  const hasDarkMode = await page.evaluate(() => {
    const html = document.documentElement;
    return html.classList.contains('dark') || html.getAttribute('data-theme') === 'dark';
  });

  // Try opening first "create" or "new" modal (safe — will cancel)
  let modalOpened = null;
  const createBtn = await page.$('button:not([disabled])');
  // We'll look specifically for create/new/add buttons
  const safeBtn = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button:not([disabled])'));
    return btns.find(b => {
      const txt = b.textContent?.trim().toLowerCase() || '';
      return (txt.includes('create') || txt.includes('add') || txt.includes('new')) && txt.length < 50;
    }) || null;
  });

  if (safeBtn) {
    const btnInfo = await safeBtn.evaluate(el => ({ text: el.textContent?.trim(), disabled: el.disabled }));
    if (btnInfo && !btnInfo.disabled) {
      try {
        await safeBtn.click({ timeout: 3000 });
        await sleep(800);
        // Check if modal opened
        const modal = await page.$('[role="dialog"], [class*="modal"], [class*="Modal"]');
        if (modal) {
          modalOpened = btnInfo.text;
          // Cancel it
          const cancelBtn = await modal.$('button[class*="cancel"], button[class*="Cancel"], button:has-text("Cancel"), button:has-text("Close")');
          if (cancelBtn) {
            await cancelBtn.click({ timeout: 2000 }).catch(() => {});
          } else {
            // Press Escape
            await page.keyboard.press('Escape');
          }
          await sleep(500);
        }
      } catch (e) {
        // Swallow — button may navigate or have async behavior
      }
    }
  }

  // Check permission-denied visibility: look for disabled buttons with title/tooltip
  const gatedBtns = actionBtns.filter(b => b.disabled && (b.title.includes('permission') || b.title.includes('lack') || b.title.includes('grant')));
  const ungatedBtns = actionBtns.filter(b => !b.disabled && !b.title && !b.ariaLabel.includes('permission'));

  return {
    route,
    redirectedToSignin,
    warming,
    hasRealData,
    tabButtons: tabButtons.slice(0, 10),
    tabLinks: tabLinks.slice(0, 10),
    actionBtns: actionBtns.slice(0, 20),
    gatedBtns: gatedBtns.slice(0, 10),
    ungatedBtns: ungatedBtns.slice(0, 10),
    modalOpened,
    networkErrors5xx,
    consoleErrs: consoleErrs.slice(0, 5),
    pageErrors: pageErrors.slice(0, 5),
    vendorLeaks,
    hasDarkMode,
    hasLoadingState,
    hasEmptyState,
    snowflakeCount: snowflakeMatches,
  };
}

// Main
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: STATE,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

console.log('=== Governance Module Audit ===\n');

const results = [];
for (const route of ROUTES) {
  console.log(`Auditing ${route}...`);
  try {
    const result = await auditPage(page, route);
    results.push(result);

    // Reset listeners for next page
    page.removeAllListeners('console');
    page.removeAllListeners('pageerror');
    page.removeAllListeners('response');

    const status = result.redirectedToSignin ? 'UNAUTHED' :
      result.warming ? 'WARMING' :
      result.hasRealData ? 'OK(data)' : 'OK(sparse)';

    console.log(`  Status: ${status}`);
    console.log(`  Tabs found: ${result.tabButtons.length} tab buttons, ${result.tabLinks.length} tab links`);
    console.log(`  Actions: ${result.actionBtns.length} mutating btns (${result.gatedBtns.length} gated, ${result.ungatedBtns.length} ungated)`);
    if (result.networkErrors5xx.length) console.log(`  5xx: ${JSON.stringify(result.networkErrors5xx)}`);
    if (result.consoleErrs.length) console.log(`  console errors: ${result.consoleErrs.slice(0,2)}`);
    if (result.vendorLeaks.length) console.log(`  Vendor leaks: ${result.vendorLeaks}`);
    if (result.modalOpened) console.log(`  Modal opened+cancelled: "${result.modalOpened}"`);
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    results.push({ route, error: err.message });
  }
}

await browser.close();

// Summary output as JSON for parsing
console.log('\n=== FULL RESULTS JSON ===');
console.log(JSON.stringify(results, null, 2));
