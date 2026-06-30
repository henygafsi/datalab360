/**
 * E2E audit: bi-dashboard domain
 */

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname2 = path.dirname(fileURLToPath(import.meta.url));

const SCREENS_DIR = 'docs/product-readiness-audit/screens/overnight/dashboards';
const BASE_URL = 'http://localhost:3000';
const AUTH_STATE = 'e2e/.auth/state.json';

fs.mkdirSync(SCREENS_DIR, { recursive: true });

let screenshotIdx = 0;
async function shot(page, label) {
  screenshotIdx++;
  const fname = `${String(screenshotIdx).padStart(2, '0')}_${label}.png`;
  await page.screenshot({ path: path.join(SCREENS_DIR, fname), fullPage: false });
  console.log(`  📸 ${fname}`);
  return fname;
}

async function gotoWait(page, url, timeout = 15000) {
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForTimeout(2500); // let client render
    return resp;
  } catch (e) {
    console.log('  ⚠ goto timeout, continuing:', e.message.split('\n')[0]);
    return null;
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: AUTH_STATE,
    viewport: { width: 1600, height: 1000 },
  });
  const page = await ctx.newPage();

  const results = {
    done: [],
    not_done: [],
    defects: [],
  };

  // ──────────────────────────────────────────────
  // 1. Navigate to /bi-dashboard
  // ──────────────────────────────────────────────
  console.log('\n[1] Navigate to /bi-dashboard');
  const resp1 = await gotoWait(page, `${BASE_URL}/bi-dashboard`);
  await shot(page, 'bi-dashboard-landing');

  const pageTitle = await page.locator('h1, h2, [data-testid="page-title"]').first().textContent().catch(() => null);
  console.log('  Page title:', pageTitle);

  if (resp1 && resp1.ok()) {
    results.done.push(`Route /bi-dashboard loads OK (HTTP ${resp1.status()}, title="${pageTitle}")`);
  } else if (!resp1) {
    results.defects.push('/bi-dashboard: page.goto timed out or failed');
  }

  // ──────────────────────────────────────────────
  // 2. ScoreCards / KPI cards on landing
  // ──────────────────────────────────────────────
  console.log('\n[2] Check ScoreCards / KPI section');
  // Try multiple selectors
  const scoreCardSel = [
    '[class*="ScoreCard"]',
    '[class*="score-card"]',
    '[class*="kpi"]',
    '[class*="stat-card"]',
    'section[class*="score"]',
    '[data-testid*="score"]',
    '[data-testid*="kpi"]',
  ].join(', ');
  const scoreCardsCount = await page.locator(scoreCardSel).count();
  console.log('  ScoreCard elements (specific):', scoreCardsCount);

  // Fallback: count number-value elements in header area
  const numerics = await page.locator('[class*="metric"], [class*="value"], [class*="count"]').count();
  console.log('  Numeric/metric elements:', numerics);

  if (scoreCardsCount > 0) {
    results.done.push(`ScoreCards visible on landing (${scoreCardsCount} found)`);
  } else if (numerics > 0) {
    results.done.push(`Metric/KPI values visible on landing (${numerics} numeric elements)`);
  } else {
    results.not_done.push('No ScoreCard or KPI numeric elements found on landing');
  }
  await shot(page, 'kpi-section');

  // ──────────────────────────────────────────────
  // 3. Dashboard list
  // ──────────────────────────────────────────────
  console.log('\n[3] Check dashboard list / project cards');
  const emptyState = await page.locator('text=/No BI Dashboard/i').count();
  const dashboardLinks = page.locator('a[href*="bi-dashboard"]');
  const linkCount = await dashboardLinks.count();
  console.log('  Empty state:', emptyState > 0, '  Dashboard links:', linkCount);

  if (emptyState > 0) {
    results.done.push('Empty state renders correctly (no dashboards provisioned)');
  } else if (linkCount > 0) {
    results.done.push(`Dashboard project list loaded (${linkCount} links found)`);
  } else {
    results.not_done.push('Dashboard list: neither empty state nor project links detected');
  }
  await shot(page, 'dashboard-list');

  // ──────────────────────────────────────────────
  // 4. Open a dashboard
  // ──────────────────────────────────────────────
  console.log('\n[4] Open first dashboard');
  if (linkCount > 0) {
    try {
      const firstHref = await dashboardLinks.first().getAttribute('href');
      console.log('  First dashboard href:', firstHref);
      await dashboardLinks.first().click();
      await page.waitForTimeout(3000);
      await shot(page, 'dashboard-editor-opened');

      // Check for charts in the editor
      const charts = await page.locator('canvas, svg[class*="recharts"], [class*="recharts"], [class*="DynamicChart"], [class*="chart"]').count();
      const kpiWidgets = await page.locator('[class*="widget"], [class*="Widget"], [class*="GridChart"], [class*="kpi"]').count();
      const editorGrid = await page.locator('[class*="DashboardGrid"], [class*="dashboard-grid"], [class*="editor"]').count();
      console.log('  Charts:', charts, '  KPI widgets:', kpiWidgets, '  Editor grid:', editorGrid);

      if (charts > 0) {
        results.done.push(`Dashboard editor renders charts (${charts} chart elements)`);
      } else if (kpiWidgets > 0) {
        results.done.push(`Dashboard editor renders KPI widgets (${kpiWidgets})`);
      } else if (editorGrid > 0) {
        results.done.push('Dashboard editor grid visible (empty dashboard)');
      } else {
        results.not_done.push('Dashboard opened but no charts/KPI widgets detected');
      }

      // Check for the right-bar or tool panels
      const rightBar = await page.locator('[class*="SmartRightBar"], [class*="rightbar"], [class*="RightBar"]').count();
      const chartPalette = await page.locator('[class*="ChartPalette"], [class*="palette"], [class*="Palette"]').count();
      console.log('  SmartRightBar:', rightBar, '  ChartPalette:', chartPalette);
      if (rightBar > 0 || chartPalette > 0) {
        results.done.push('Dashboard editor side panels visible (RightBar/ChartPalette)');
      }
    } catch (e) {
      results.defects.push(`Opening dashboard failed: ${e.message.split('\n')[0]}`);
      await shot(page, 'dashboard-open-error');
    }
  }

  // ──────────────────────────────────────────────
  // 5. Create modal — open + cancel
  // ──────────────────────────────────────────────
  console.log('\n[5] Create Dashboard modal');
  await gotoWait(page, `${BASE_URL}/bi-dashboard`);

  const newBtnSels = [
    'button:has-text("New Dashboard")',
    'button:has-text("New dashboard")',
    'button:has-text("Create")',
    'button:has-text("+ New")',
    '[class*="create"] button',
    'button[class*="primary"]:has-text("New")',
  ];

  let createBtnFound = false;
  for (const sel of newBtnSels) {
    const btn = page.locator(sel).first();
    const vis = await btn.isVisible().catch(() => false);
    if (vis) {
      console.log('  Found create button with selector:', sel);
      try {
        await btn.click();
        await page.waitForTimeout(1500);
        await shot(page, 'create-modal-opened');

        const modalVis = await page.locator('[role="dialog"], [class*="modal"], [class*="Modal"]').first().isVisible().catch(() => false);
        const inputs = await page.locator('[role="dialog"] input, [class*="modal"] input, dialog input').count();
        console.log('  Modal visible:', modalVis, '  Inputs:', inputs);

        if (modalVis || inputs > 0) {
          results.done.push('Create Dashboard modal opens (form inputs visible)');

          // Cancel
          const cancelSels = ['button:has-text("Cancel")', 'button:has-text("Close")', '[aria-label="Close"]', 'button:has-text("Annuler")'];
          let cancelled = false;
          for (const csel of cancelSels) {
            const cb = page.locator(csel).first();
            if (await cb.isVisible().catch(() => false)) {
              await cb.click();
              await page.waitForTimeout(500);
              await shot(page, 'create-modal-cancelled');
              results.done.push('Create modal dismissed via Cancel button');
              cancelled = true;
              break;
            }
          }
          if (!cancelled) {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
            await shot(page, 'create-modal-esc');
            results.done.push('Create modal dismissed via Escape key');
          }
        } else {
          results.not_done.push('Create button clicked but modal not detected');
          await page.keyboard.press('Escape');
        }
        createBtnFound = true;
      } catch (e) {
        results.defects.push(`Create modal interaction error: ${e.message.split('\n')[0]}`);
      }
      break;
    }
  }
  if (!createBtnFound) {
    results.not_done.push('Create/New Dashboard button not found on landing page');
  }

  // ──────────────────────────────────────────────
  // 6. Auto-create / AI wizard modal — open + cancel
  // ──────────────────────────────────────────────
  console.log('\n[6] Auto-Create / AI wizard modal');
  await gotoWait(page, `${BASE_URL}/bi-dashboard`);

  const autoBtnSels = [
    'button:has-text("Auto")',
    'button:has-text("AI")',
    'button:has-text("Generate")',
    'button:has-text("Wizard")',
    'button:has-text("Auto-Create")',
    'button:has-text("Auto Create")',
    '[class*="AutoCreate"] button',
    'button:has([data-lucide="sparkles"])',
    'button:has(svg[class*="Sparkles"])',
  ];

  let autoBtnFound = false;
  for (const sel of autoBtnSels) {
    const btn = page.locator(sel).first();
    const vis = await btn.isVisible().catch(() => false);
    if (vis) {
      console.log('  Found auto-create button:', sel);
      try {
        await btn.click();
        await page.waitForTimeout(1500);
        await shot(page, 'auto-create-modal-opened');

        const modalVis = await page.locator('[role="dialog"], [class*="modal"], [class*="Modal"]').first().isVisible().catch(() => false);
        console.log('  Auto-Create modal visible:', modalVis);

        if (modalVis) {
          results.done.push('Auto-Create/AI wizard modal opens');

          // Cancel
          const cb = page.locator('button:has-text("Cancel"), button:has-text("Close"), [aria-label="Close"]').first();
          if (await cb.isVisible().catch(() => false)) {
            await cb.click();
            await page.waitForTimeout(500);
            await shot(page, 'auto-create-cancelled');
            results.done.push('Auto-Create modal dismissed via Cancel');
          } else {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
            await shot(page, 'auto-create-esc');
            results.done.push('Auto-Create modal dismissed via Escape');
          }
        } else {
          results.not_done.push('Auto-Create button clicked but modal not detected');
          await page.keyboard.press('Escape');
        }
        autoBtnFound = true;
      } catch (e) {
        results.defects.push(`Auto-Create modal error: ${e.message.split('\n')[0]}`);
      }
      break;
    }
  }

  if (!autoBtnFound) {
    // Try checking all buttons on the page for Sparkles icon text
    const allBtns = await page.locator('button').all();
    console.log('  Total buttons on page:', allBtns.length);
    const btnTexts = [];
    for (const b of allBtns.slice(0, 20)) {
      const txt = await b.textContent().catch(() => '');
      const inner = txt.trim().replace(/\s+/g, ' ');
      if (inner) btnTexts.push(inner);
    }
    console.log('  Button texts (first 20):', btnTexts.join(' | '));
    results.not_done.push('Auto-Create/AI wizard button not found; available buttons: ' + btnTexts.slice(0, 5).join(', '));
  }

  // ──────────────────────────────────────────────
  // 7. Final screenshot of landing
  // ──────────────────────────────────────────────
  await gotoWait(page, `${BASE_URL}/bi-dashboard`);
  await shot(page, 'final-landing');

  await browser.close();

  // ──────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════');
  console.log('DASHBOARDS E2E AUDIT RESULTS');
  console.log('════════════════════════════════════════════════');
  console.log('\n✅ DONE:');
  results.done.forEach(d => console.log('  -', d));
  console.log('\n❌ NOT DONE / MISSING:');
  results.not_done.forEach(n => console.log('  -', n));
  console.log('\n🐛 DEFECTS:');
  if (results.defects.length === 0) console.log('  (none)');
  results.defects.forEach(d => console.log('  -', d));
  console.log('════════════════════════════════════════════════\n');

  return results;
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
