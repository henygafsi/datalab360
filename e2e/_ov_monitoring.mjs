/**
 * READ-ONLY E2E audit — "monitoring" domain
 * Covers:
 *   /administration          (Platform Health KPIs + sub-tabs)
 *   /admin/api-health
 *   /observability           (default tab)
 *   /observability/lineage
 *   /observability/slo
 *   /observability/budget
 *   /observability/alerts
 *
 * Output: screenshots to docs/product-readiness-audit/screens/overnight/monitoring/
 *         JSON result to stdout on exit
 *
 * NON-DESTRUCTIVE: read-only, no mutations submitted.
 */

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3000';
const STORAGE_STATE = path.resolve(__dirname, '.auth/state.json');
const SCREEN_DIR = path.resolve(
  __dirname,
  '../docs/product-readiness-audit/screens/overnight/monitoring'
);
fs.mkdirSync(SCREEN_DIR, { recursive: true });

const NAV_TIMEOUT = 25_000;
const SETTLE = 3_500; // ms to wait after nav for data to load

// ─── helpers ──────────────────────────────────────────────────────────────────

function log(msg) { process.stdout.write(`[monitoring] ${msg}\n`); }

function isWarmingText(t) {
  return /warming\s*up|cache\s*(is\s*)?init|initializ|loading\s*cache/i.test(t);
}

function hasRealData(t) {
  // numbers, dates, table rows, common data patterns
  return /\d{1,3}(,\d{3})+|\d{4}-\d{2}-\d{2}|ms|KB|MB|GB|P\d{2}|success\s*rate|error\s*rate|endpoint|latency|SLO|SLA|budget|lineage|alert/i.test(t);
}

function hasErrorState(t) {
  return /error|failed|unavailable|not found|5[0-9][0-9]/i.test(t) &&
         !/no errors/i.test(t);
}

function classify(t) {
  if (isWarmingText(t)) return 'WARMING';
  if (hasErrorState(t)) return 'ERROR_STATE';
  if (hasRealData(t))   return 'REAL_DATA';
  return 'BLANK_OR_STUB';
}

// ─── result container ─────────────────────────────────────────────────────────

const report = {
  pages: [],       // { url, status, screenshot, classification, notes }
  http5xx: [],
  consoleErrors: [],
  tabs: [],        // sub-tabs discovered + classified
};

// ─── browser bootstrap ────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: STORAGE_STATE,
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();

// Network + console monitoring
page.on('response', (r) => {
  if (r.status() >= 500 && !/\.(png|jpg|svg|woff2?|ico)(\?|$)/.test(r.url())) {
    const entry = `${r.status()} ${r.url().replace(BASE, '').split('?')[0]}`;
    if (!report.http5xx.includes(entry)) report.http5xx.push(entry);
  }
});
page.on('pageerror', (e) => {
  const msg = String(e.message || e).slice(0, 300);
  report.consoleErrors.push(msg);
});

// ─── navigation helpers ───────────────────────────────────────────────────────

async function goto(url, label) {
  log(`→ ${url}`);
  try {
    await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(SETTLE);
  } catch (e) {
    log(`  TIMEOUT/ERROR: ${e.message}`);
  }
  const title = await page.title().catch(() => '?');
  const redirected = page.url().includes('/signin') || page.url().includes('/login');
  return { url, title, redirected };
}

async function snap(filename, label) {
  const fp = path.join(SCREEN_DIR, filename);
  await page.screenshot({ path: fp, fullPage: false }).catch(() => {});
  log(`  📸 ${filename}`);
  return fp;
}

async function audit(url, ssFile, extra = {}) {
  const nav = await goto(url, url);
  const screenshotPath = await snap(ssFile, url);
  const bodyText = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
  const cls = nav.redirected ? 'AUTH_REDIRECT' : classify(bodyText);
  const entry = {
    url,
    title: nav.title,
    classification: cls,
    screenshot: screenshotPath,
    redirected: nav.redirected,
    notes: [],
    ...extra,
  };

  // Detect vendor name leaks
  if (/snowflake|cortex|kimi/i.test(bodyText)) {
    entry.notes.push('⚠ vendor name visible in page text');
  }

  // Count visible numbers (proxy for real data density)
  const numberMatches = bodyText.match(/\b\d[\d,.]+\b/g) || [];
  entry.numericValuesFound = numberMatches.length;

  log(`  → classification: ${cls} | numbers: ${numberMatches.length}`);
  report.pages.push(entry);
  return { bodyText, entry };
}

// ─── 1. /administration ───────────────────────────────────────────────────────

log('\n=== /administration ===');
const { bodyText: adminText } = await audit('/administration', '01_administration_main.png');

// Discover sub-tabs in /administration
const adminTabLabels = await page.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll('[role="tab"], button[data-tab], nav a, .tab-button'));
  return tabs.map(t => ({ text: t.innerText?.trim(), href: t.getAttribute('href') || '' }))
             .filter(t => t.text && t.text.length < 80);
}).catch(() => []);
log(`  admin tabs discovered: ${adminTabLabels.map(t => t.text).join(' | ')}`);

// Try clicking sub-tabs in administration
const tabSelectors = [
  '[role="tab"]',
  'button[data-tab]',
  '[data-radix-collection-item]',
];
let adminTabEls = [];
for (const sel of tabSelectors) {
  adminTabEls = await page.$$(sel).catch(() => []);
  if (adminTabEls.length > 0) break;
}

if (adminTabEls.length > 1) {
  for (let i = 1; i < Math.min(adminTabEls.length, 6); i++) {
    try {
      const tabText = await adminTabEls[i].innerText().catch(() => `tab${i}`);
      log(`  clicking admin tab[${i}]: ${tabText}`);
      await adminTabEls[i].click({ timeout: 5_000 });
      await page.waitForTimeout(2_000);
      const ssName = `02_administration_tab${i}_${tabText.replace(/\s+/g,'_').slice(0,20)}.png`;
      await snap(ssName, `admin tab ${i}`);
      const tabBody = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
      report.tabs.push({
        parent: '/administration',
        tab: tabText,
        classification: classify(tabBody),
        screenshot: path.join(SCREEN_DIR, ssName),
      });
    } catch (e) {
      log(`  tab click error: ${e.message}`);
    }
  }
}

// ─── 2. /admin/api-health ─────────────────────────────────────────────────────

log('\n=== /admin/api-health ===');
await audit('/admin/api-health', '03_admin_api_health.png');

// Try to find filter/tab controls in api-health
await page.waitForTimeout(1_000);
const apiHealthTabs = await page.$$('[role="tab"]').catch(() => []);
if (apiHealthTabs.length > 0) {
  for (let i = 0; i < Math.min(apiHealthTabs.length, 4); i++) {
    try {
      const t = await apiHealthTabs[i].innerText().catch(() => `t${i}`);
      await apiHealthTabs[i].click({ timeout: 5_000 });
      await page.waitForTimeout(1_500);
      const ssName = `04_api_health_tab${i}_${t.replace(/\s+/g,'_').slice(0,20)}.png`;
      await snap(ssName, `api-health tab ${i}`);
      const body = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
      report.tabs.push({
        parent: '/admin/api-health',
        tab: t,
        classification: classify(body),
        screenshot: path.join(SCREEN_DIR, ssName),
      });
    } catch {}
  }
}

// ─── 3. /observability (default) ─────────────────────────────────────────────

log('\n=== /observability ===');
await audit('/observability', '05_observability_default.png');

// ─── 4. /observability/lineage ───────────────────────────────────────────────

log('\n=== /observability/lineage ===');
await audit('/observability/lineage', '06_observability_lineage.png');

// ─── 5. /observability/slo ───────────────────────────────────────────────────

log('\n=== /observability/slo ===');
await audit('/observability/slo', '07_observability_slo.png');

// ─── 6. /observability/budget ────────────────────────────────────────────────

log('\n=== /observability/budget ===');
await audit('/observability/budget', '08_observability_budget.png');

// ─── 7. /observability/alerts ────────────────────────────────────────────────

log('\n=== /observability/alerts ===');
await audit('/observability/alerts', '09_observability_alerts.png');

// ─── 8. Bonus: Platform Health KPI section (scroll into /administration) ──────

log('\n=== /administration — scrolled KPI area ===');
await page.goto(`${BASE}/administration`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
await page.waitForTimeout(SETTLE);
// scroll to find KPI cards
await page.evaluate(() => window.scrollTo(0, 0));
await snap('10_administration_kpis_top.png', 'administration KPIs top');
await page.evaluate(() => window.scrollTo(0, 600));
await page.waitForTimeout(500);
await snap('11_administration_kpis_scroll.png', 'administration KPIs scroll');

// ─── finalize ─────────────────────────────────────────────────────────────────

await browser.close();

log('\n\n====== MONITORING DOMAIN REPORT ======');
for (const p of report.pages) {
  log(`[${p.classification}] ${p.url}  (${p.numericValuesFound} numbers, ${p.notes.length ? p.notes.join(', ') : 'no extra notes'})`);
}
log('\n--- sub-tabs ---');
for (const t of report.tabs) {
  log(`[${t.classification}] ${t.parent} → ${t.tab}`);
}
if (report.http5xx.length) {
  log('\n--- HTTP 5xx ---');
  report.http5xx.forEach(e => log(`  ${e}`));
}
if (report.consoleErrors.length) {
  log('\n--- Console errors ---');
  report.consoleErrors.slice(0, 10).forEach(e => log(`  ${e}`));
}

log('\nJSON:');
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
