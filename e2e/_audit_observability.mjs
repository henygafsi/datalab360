/**
 * READ-ONLY authenticated Playwright audit — observability module
 * Covers: /observability, /observability/lineage, /observability/slo,
 *         /observability/budget, /observability/alerts
 * Auth: storageState from e2e/.auth/state.json (HAHA / ACCOUNTADMIN)
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3000';
const STORAGE_STATE = path.resolve(__dirname, '.auth/state.json');

const ROUTES = [
  '/observability',
  '/observability/lineage',
  '/observability/slo',
  '/observability/budget',
  '/observability/alerts',
];

const results = {
  pages: [],
  errors: [],
  actions: [],
  console_errors: [],
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: STORAGE_STATE,
  viewport: { width: 1440, height: 900 },
});

const page = await ctx.newPage();

// Capture all page errors
const pageErrors = [];
page.on('pageerror', (e) => {
  const msg = (e.message || String(e)).slice(0, 300);
  pageErrors.push(msg);
  results.console_errors.push(msg);
});

// Capture 5xx responses
const http5xx = [];
page.on('response', (resp) => {
  if (resp.status() >= 500 && !/\.(png|jpg|svg|woff|ico|woff2)/.test(resp.url())) {
    const entry = `${resp.status()} ${resp.url().replace(BASE, '').split('?')[0]}`;
    http5xx.push(entry);
    results.errors.push(entry);
  }
});

// Also capture 4xx for context
const http4xx = [];
page.on('response', (resp) => {
  if (resp.status() >= 400 && resp.status() < 500 && !/\.(png|jpg|svg|woff|ico|woff2)/.test(resp.url())) {
    http4xx.push(`${resp.status()} ${resp.url().replace(BASE, '').split('?')[0]}`);
  }
});

function classifyPage(url, bodyText) {
  if (url.includes('/signin')) return 'redirect-to-signin';
  const warming = /warming up|cache is initializing|initializing cache|data is loading/i.test(bodyText);
  if (warming) return 'warming';
  return 'ok';
}

async function scanButtons(page) {
  // Find buttons with action-like text
  const actionKeywords = /create|edit|delete|grant|revoke|approve|deny|apply|publish|run|deploy|add|remove|configure|ack|acknowledge|save|submit|refresh/i;
  const buttons = await page.locator('button').all();
  const found = [];
  for (const btn of buttons) {
    try {
      const text = (await btn.innerText({ timeout: 1000 }).catch(() => '')).trim();
      const title = await btn.getAttribute('title').catch(() => '') || '';
      const disabled = await btn.isDisabled().catch(() => false);
      if (text && actionKeywords.test(text)) {
        found.push({ text, title: title || undefined, disabled });
      }
    } catch { /* ignore stale element */ }
  }
  return found;
}

async function scanPermissionGating(page) {
  // Look for elements with title attributes containing permission language
  const gated = [];
  const permText = /permission|grant|role|access denied|lack the|ask an administrator/i;
  const els = await page.locator('[title]').all();
  for (const el of els) {
    try {
      const title = await el.getAttribute('title', { timeout: 500 }).catch(() => '');
      if (title && permText.test(title)) {
        const tag = await el.evaluate(e => e.tagName.toLowerCase()).catch(() => '');
        const text = (await el.innerText({ timeout: 500 }).catch(() => '')).trim().slice(0, 80);
        gated.push({ tag, text, title: title.slice(0, 200) });
      }
    } catch { /* ignore */ }
  }
  return gated;
}

async function checkVendorLeaks(bodyText) {
  const leaks = [];
  // Check for forbidden vendor names in visible text
  if (/snowflake/i.test(bodyText)) leaks.push('Snowflake in body text');
  if (/\bcortex\b/i.test(bodyText)) leaks.push('Cortex in body text');
  if (/\bkimi\b/i.test(bodyText)) leaks.push('Kimi in body text');
  return leaks;
}

async function checkEmptyStates(page) {
  // Look for 0-value KPIs that look like placeholders
  const emptyIndicators = [];
  const body = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
  if (/no slos defined|no resource monitors|no active alerts|lineage is not available/i.test(body)) {
    emptyIndicators.push('empty-state shown (graceful)');
  }
  if (/warming up|cache is initializing/i.test(body)) {
    emptyIndicators.push('still warming');
  }
  return emptyIndicators;
}

// ---- Visit each route ----
for (const route of ROUTES) {
  console.log(`\n=== Visiting ${route} ===`);
  pageErrors.length = 0;
  http5xx.length = 0;

  const page5xx = [];
  const pageOnResp = (resp) => {
    if (resp.status() >= 500 && !/\.(png|jpg|svg|woff|ico|woff2)/.test(resp.url())) {
      page5xx.push(`${resp.status()} ${resp.url().replace(BASE, '').split('?')[0]}`);
    }
  };
  page.on('response', pageOnResp);

  const pagePageErrors = [];
  const pageOnErr = (e) => pagePageErrors.push((e.message || String(e)).slice(0, 200));
  page.on('pageerror', pageOnErr);

  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  // Wait for data to load (dev server + network)
  await page.waitForTimeout(7000);

  const finalUrl = page.url();
  const bodyText = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
  const pageStatus = classifyPage(finalUrl, bodyText);

  console.log(`  URL: ${finalUrl}`);
  console.log(`  Status: ${pageStatus}`);

  // Scan for action buttons
  const buttons = await scanButtons(page);
  console.log(`  Action buttons: ${buttons.map(b => `[${b.disabled ? 'disabled' : 'enabled'}] "${b.text}"`).join(', ') || 'none'}`);

  // Scan permission gating
  const gated = await scanPermissionGating(page);
  if (gated.length > 0) {
    console.log(`  Permission-gated elements: ${gated.length}`);
    gated.forEach(g => console.log(`    ${g.tag} "${g.text}" → ${g.title}`));
  }

  // Vendor leaks
  const vendorLeaks = await checkVendorLeaks(bodyText);
  if (vendorLeaks.length > 0) {
    console.log(`  VENDOR LEAK: ${vendorLeaks.join(', ')}`);
  }

  // Empty/warming states
  const emptyStates = await checkEmptyStates(page);

  // Check for ?tab= tabs (tab buttons)
  const tabButtons = [];
  const tabEls = await page.locator('[role="tab"], button[class*="tab"], button[data-tab]').all();
  for (const tab of tabEls) {
    try {
      const text = (await tab.innerText({ timeout: 500 }).catch(() => '')).trim();
      if (text) tabButtons.push(text);
    } catch {}
  }
  if (tabButtons.length > 0) console.log(`  Tabs: ${tabButtons.join(' | ')}`);

  // Try hovering over first enabled action button (safe, read-only)
  const enabledActionButtons = buttons.filter(b => !b.disabled && !/refresh/i.test(b.text));
  if (enabledActionButtons.length > 0) {
    const first = enabledActionButtons[0];
    try {
      const btnEl = page.locator(`button:has-text("${first.text}")`).first();
      await btnEl.hover({ timeout: 2000 });
      console.log(`  Hovered: "${first.text}" (no modal required)`);

      // If it's "Add SLO" or "Create Monitor" or "Details", open and close the panel
      if (/add slo|create monitor/i.test(first.text)) {
        await btnEl.click({ timeout: 2000 });
        await page.waitForTimeout(1000);
        // Look for cancel button to close
        const cancelBtn = page.locator('button:has-text("Cancel")').first();
        if (await cancelBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
          await cancelBtn.click();
          await page.waitForTimeout(500);
          console.log(`  Opened+cancelled panel for "${first.text}"`);
        }
      }
    } catch (e) {
      console.log(`  Hover failed on "${first.text}": ${e.message?.slice(0, 60)}`);
    }
  }

  // For alerts page: try opening a Details panel if alerts are present
  if (route === '/observability/alerts') {
    const detailsBtn = page.locator('button:has-text("Details")').first();
    if (await detailsBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await detailsBtn.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(800);
      // Close the action rail (look for close button)
      const closeBtn = page.locator('button[aria-label="Close"], button:has-text("Close"), [data-close]').first();
      if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeBtn.click().catch(() => {});
        console.log('  Opened+closed alert Details panel');
      } else {
        // Press Escape to close
        await page.keyboard.press('Escape');
        console.log('  Opened alert Details panel, closed via Escape');
      }
      await page.waitForTimeout(500);
    }
  }

  page.off('response', pageOnResp);
  page.off('pageerror', pageOnErr);

  results.pages.push({
    route,
    status: pageStatus,
    finalUrl,
    buttons: buttons.map(b => ({ text: b.text, disabled: b.disabled, gated: !!b.title })),
    gated_count: gated.length,
    page5xx: [...page5xx],
    pageErrors: [...pagePageErrors],
    vendorLeaks,
    emptyStates,
    tabButtons,
  });

  // Record action buttons globally
  buttons.forEach(b => {
    if (!results.actions.find(a => a.text === b.text && a.route === route)) {
      results.actions.push({ route, text: b.text, disabled: b.disabled, gated: !!b.title });
    }
  });

  if (page5xx.length > 0) console.log(`  5xx: ${page5xx.join(', ')}`);
  if (pagePageErrors.length > 0) console.log(`  PageErrors: ${pagePageErrors.slice(0, 3).join(' | ')}`);
}

await browser.close();

// ---- Summary ----
console.log('\n\n========== AUDIT SUMMARY ==========');
console.log(`Pages visited: ${results.pages.length}`);
results.pages.forEach(p => {
  console.log(`  ${p.status.padEnd(20)} ${p.route}`);
  if (p.page5xx.length) console.log(`    5xx: ${p.page5xx.join(', ')}`);
  if (p.pageErrors.length) console.log(`    page errors: ${p.pageErrors[0]}`);
  if (p.vendorLeaks.length) console.log(`    VENDOR LEAK: ${p.vendorLeaks.join(', ')}`);
});

console.log('\nAll action buttons discovered:');
results.actions.forEach(a => {
  console.log(`  [${a.disabled ? 'DISABLED' : 'ENABLED'}] [${a.gated ? 'GATED' : 'ungated?'}] "${a.text}" on ${a.route}`);
});

console.log('\nAll 5xx errors:');
[...new Set(results.errors)].forEach(e => console.log(`  ${e}`));

console.log('\nAll page errors:');
[...new Set(results.console_errors)].forEach(e => console.log(`  ${e}`));

// Output machine-readable JSON for the parent agent
console.log('\n\n===JSON_RESULTS===');
console.log(JSON.stringify(results, null, 2));
