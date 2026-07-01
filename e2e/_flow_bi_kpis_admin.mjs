/**
 * Flow: BI Dashboard KPIs + Administration Platform Health
 * Screenshots → docs/product-readiness-audit/screens/bi-kpis-admin/
 * Auth: e2e/.auth/state.json (HAHA / ACCOUNTADMIN)
 */

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_STATE = path.resolve(__dirname, '.auth/state.json');
const BASE = 'http://localhost:3000';
const SCREENS = path.resolve(
  __dirname,
  '../docs/product-readiness-audit/screens/bi-kpis-admin'
);

fs.mkdirSync(SCREENS, { recursive: true });

const errors5xx = [];
const consoleErrors = [];
const findings = [];

function log(msg) {
  console.log(`[flow] ${msg}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function shot(page, name) {
  const p = path.join(SCREENS, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  log(`Screenshot → ${p}`);
  return p;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: AUTH_STATE,
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();

  page.on('response', (resp) => {
    if (resp.status() >= 500) {
      errors5xx.push({ url: resp.url(), status: resp.status(), page: page.url() });
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push({ message: err.message, page: page.url() });
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (
        t.includes('favicon') ||
        t.includes('Warning:') ||
        t.includes('React does not') ||
        t.includes('hydration')
      )
        return;
      consoleErrors.push({ message: t, page: page.url() });
    }
  });

  // ─── 1. BI Dashboard index ─────────────────────────────────────────────
  log('Navigating to /bi-dashboard …');
  await page.goto(`${BASE}/bi-dashboard`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await sleep(5000);
  await shot(page, '01_bi_dashboard_index');

  // Check what text is visible (KPIs / placeholders)
  const bodyText = await page.evaluate(() => document.body.innerText);
  const hasRealValues = /\d[\d,\.]+/.test(bodyText);
  findings.push({
    step: 'bi-dashboard index',
    hasRealValues,
    hasDashes: bodyText.includes('—') || bodyText.includes('--'),
    hasMock: bodyText.toLowerCase().includes('mock') || bodyText.toLowerCase().includes('demo'),
    url: page.url(),
  });
  log(`  real numbers: ${hasRealValues}`);

  // ─── 2. Try to open an existing dashboard ──────────────────────────────
  log('Looking for dashboard cards / list items …');
  // Try clicking first dashboard card link
  const cardLink = page.locator('a[href*="/bi-dashboard/"], [data-testid*="dashboard"], .dashboard-card, [class*="dashboard-card"], [class*="DashboardCard"]').first();
  const cardCount = await cardLink.count();
  log(`  found ${cardCount} card/link elements`);

  if (cardCount > 0) {
    try {
      await cardLink.click({ timeout: 8_000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });
      await sleep(2500);
      await shot(page, '02_bi_dashboard_opened');

      const innerText = await page.evaluate(() => document.body.innerText);
      findings.push({
        step: 'bi-dashboard opened',
        hasRealValues: /\d[\d,\.]+/.test(innerText),
        hasDashes: innerText.includes('—') || innerText.includes('--'),
        url: page.url(),
      });
    } catch (e) {
      log(`  click failed: ${e.message}`);
    }
  } else {
    // Try the create flow — open it and cancel
    log('No cards found — looking for Create button …');
    const createBtn = page
      .locator('button, [role="button"]')
      .filter({ hasText: /create|new|add/i })
      .first();
    const createCount = await createBtn.count();
    if (createCount > 0) {
      try {
        await createBtn.click({ timeout: 8_000 });
        await sleep(1500);
        await shot(page, '02_bi_create_flow_opened');
        // Cancel / close
        const cancelBtn = page
          .locator('button, [role="button"]')
          .filter({ hasText: /cancel|close/i })
          .first();
        if (await cancelBtn.count() > 0) {
          await cancelBtn.click({ timeout: 5_000 });
          log('  cancelled create flow');
        } else {
          await page.keyboard.press('Escape');
        }
        await sleep(800);
      } catch (e) {
        log(`  create flow error: ${e.message}`);
      }
    } else {
      log('  no create button found either');
      findings.push({ step: 'bi-dashboard', note: 'No dashboard cards and no create button visible' });
    }
  }

  // ─── 3. Scroll for KPI cards / chart widgets ─────────────────────────
  log('Scrolling for KPI cards …');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, '03_bi_kpi_cards_top');
  await page.evaluate(() => window.scrollTo(0, 400));
  await sleep(500);
  await shot(page, '04_bi_kpi_cards_scroll');

  // ─── 4. Administration — Platform Health ──────────────────────────────
  log('Navigating to /administration …');
  await page.goto(`${BASE}/administration`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await sleep(5000);
  await shot(page, '05_administration_landing');

  const adminText = await page.evaluate(() => document.body.innerText);
  findings.push({
    step: 'administration landing',
    hasRealValues: /\d[\d,\.]+/.test(adminText),
    hasDashes: adminText.includes('—') || adminText.includes('--'),
    url: page.url(),
  });

  // Platform Health tab / KPI band
  log('Looking for Platform Health tab …');
  const phTab = page
    .locator('[role="tab"], button, a')
    .filter({ hasText: /platform.?health|health/i })
    .first();
  if (await phTab.count() > 0) {
    try {
      await phTab.click({ timeout: 8_000 });
      await sleep(2500);
      await shot(page, '06_platform_health_tab');
      const phText = await page.evaluate(() => document.body.innerText);
      findings.push({
        step: 'platform-health tab',
        hasRealValues: /\d[\d,\.]+/.test(phText),
        hasDashes: phText.includes('—') || phText.includes('--'),
        url: page.url(),
      });
    } catch (e) {
      log(`  platform health tab click failed: ${e.message}`);
    }
  } else {
    log('  no Platform Health tab found; taking full-page shot anyway');
  }

  // Scroll down to see KPI band
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);
  await shot(page, '07_administration_kpi_band_top');

  // ─── 5. Summary ───────────────────────────────────────────────────────
  log('\n=== SUMMARY ===');
  for (const f of findings) {
    log(JSON.stringify(f));
  }
  if (errors5xx.length) {
    log('\n5xx ERRORS:');
    for (const e of errors5xx) log(JSON.stringify(e));
  }
  if (consoleErrors.length) {
    log('\nCONSOLE ERRORS:');
    for (const e of consoleErrors.slice(0, 20)) log(JSON.stringify(e));
  }

  await browser.close();
  log('Done.');
})();
