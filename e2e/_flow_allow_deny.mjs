import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://localhost:3000';
const AUTH_STATE = 'e2e/.auth/state.json';
const SCREEN_DIR = 'docs/product-readiness-audit/screens/allow-deny-flow';
const TIMEOUT = 15000;

let stepIdx = 0;
async function shot(page, label) {
  stepIdx++;
  const num = String(stepIdx).padStart(2, '0');
  const safe = label.replace(/[^a-zA-Z0-9_-]/g, '_');
  const file = path.join(SCREEN_DIR, `${num}_${safe}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`[screenshot] ${file}`);
  return file;
}

const shots = [];
const errors = [];
const worked = [];
const failed = [];

async function navigateTo(page, url, label) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUT });
    await page.waitForTimeout(2000);
    const s = await shot(page, label);
    shots.push(s);
    console.log(`[ok] Navigated to ${url}`);
    worked.push(`Navigated to ${url}`);
    return true;
  } catch (e) {
    console.error(`[fail] ${url}: ${e.message}`);
    failed.push(`Navigate ${url}: ${e.message.slice(0,100)}`);
    try { const s = await shot(page, label + '_error'); shots.push(s); } catch {}
    return false;
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: AUTH_STATE,
    viewport: { width: 1600, height: 1000 },
  });
  const page = await ctx.newPage();

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text().slice(0, 200)}`);
  });
  page.on('response', resp => {
    if (resp.status() >= 500) errors.push(`${resp.status()} ${resp.url().slice(0, 150)}`);
  });

  // ── 1. Security Matrix ──
  await navigateTo(page, `${BASE_URL}/governance/security-matrix`, '01_security_matrix');
  // scroll to see matrix content
  await page.evaluate(() => window.scrollBy(0, 300));
  await page.waitForTimeout(1000);
  await shot(page, '02_security_matrix_scrolled');
  shots.push(shots[shots.length-1]);

  // Look for allow/deny toggles or cells in the matrix
  const matrixCells = await page.$$('[data-testid*="permission"], [class*="matrix"], [class*="allow"], [class*="deny"], table td');
  console.log(`[info] Matrix cells found: ${matrixCells.length}`);

  // Try clicking on a cell or button in the matrix to see grant/deny dialog
  const allowBtns = await page.$$('button:has-text("Allow"), button:has-text("Grant"), button:has-text("Deny")');
  console.log(`[info] Allow/Grant/Deny buttons: ${allowBtns.length}`);

  if (allowBtns.length > 0) {
    await allowBtns[0].click();
    await page.waitForTimeout(1500);
    await shot(page, '03_security_matrix_modal_opened');
    shots.push(shots[shots.length-1]);
    worked.push('Opened allow/deny modal on security matrix');

    // Try to cancel
    const cancelBtn = await page.$('button:has-text("Cancel"), button:has-text("Close"), [aria-label="Close"]');
    if (cancelBtn) {
      await cancelBtn.click();
      await page.waitForTimeout(800);
      worked.push('Cancelled security matrix modal');
    }
  } else {
    // Try clicking on table cells that might be toggleable
    const tableCells = await page.$$('table tbody tr td');
    if (tableCells.length > 0) {
      await tableCells[3].click();
      await page.waitForTimeout(1200);
      await shot(page, '03_security_matrix_cell_click');
      shots.push(shots[shots.length-1]);
      worked.push('Clicked security matrix table cell');
    } else {
      failed.push('No clickable allow/deny controls found on security-matrix');
    }
  }

  // ── 2. Governance Grants ──
  await navigateTo(page, `${BASE_URL}/governance/grants`, '04_governance_grants');

  // Look for grant buttons / approval inbox
  await page.waitForTimeout(1500);
  const grantBtns = await page.$$('button:has-text("Grant"), button:has-text("Add Grant"), button:has-text("New Grant"), button:has-text("Approve"), button:has-text("Request")');
  console.log(`[info] Grant/Approve buttons: ${grantBtns.length}`);

  // Scroll to see content
  await page.evaluate(() => window.scrollBy(0, 300));
  await page.waitForTimeout(800);
  await shot(page, '05_governance_grants_scrolled');

  if (grantBtns.length > 0) {
    await grantBtns[0].click();
    await page.waitForTimeout(1500);
    await shot(page, '06_grant_modal_opened');
    shots.push(shots[shots.length-1]);
    worked.push('Opened grant modal on grants page');

    const cancelBtn = await page.$('button:has-text("Cancel"), button:has-text("Close"), [aria-label="Close"], [aria-label="close"]');
    if (cancelBtn) {
      await cancelBtn.click();
      await page.waitForTimeout(800);
      worked.push('Cancelled grant modal');
      await shot(page, '07_grant_modal_cancelled');
    }
  } else {
    // Try tabs on grants page
    const tabs = await page.$$('[role="tab"]');
    console.log(`[info] Tabs on grants page: ${tabs.length}`);
    if (tabs.length > 0) {
      for (let i = 0; i < Math.min(tabs.length, 3); i++) {
        await tabs[i].click();
        await page.waitForTimeout(1000);
        await shot(page, `06_grants_tab_${i}`);
      }
    }
    failed.push('No Grant/Approve buttons found on grants page');
  }

  // ── 3. Governance Policies ──
  await navigateTo(page, `${BASE_URL}/governance/policies`, '08_governance_policies');
  await page.waitForTimeout(1500);

  // Look for policy controls
  const policyBtns = await page.$$('button:has-text("Create"), button:has-text("Add"), button:has-text("Allow"), button:has-text("Deny"), button:has-text("Edit")');
  console.log(`[info] Policy buttons: ${policyBtns.length}`);

  await page.evaluate(() => window.scrollBy(0, 300));
  await page.waitForTimeout(800);
  await shot(page, '09_governance_policies_scrolled');

  if (policyBtns.length > 0) {
    await policyBtns[0].click();
    await page.waitForTimeout(1500);
    await shot(page, '10_policy_modal_opened');
    shots.push(shots[shots.length-1]);
    worked.push('Opened policy modal');

    const cancelBtn = await page.$('button:has-text("Cancel"), button:has-text("Close"), [aria-label="Close"]');
    if (cancelBtn) {
      await cancelBtn.click();
      await page.waitForTimeout(800);
      worked.push('Cancelled policy modal');
    }
  } else {
    failed.push('No policy create/edit buttons found on policies page');
  }

  // ── 4. Access Center ──
  await navigateTo(page, `${BASE_URL}/administration/access-center`, '11_access_center');
  await page.waitForTimeout(2000);
  await shot(page, '12_access_center_loaded');

  // Look for access request inbox / approval controls
  const accessBtns = await page.$$('button:has-text("Approve"), button:has-text("Deny"), button:has-text("Grant Access"), button:has-text("Request Access"), button:has-text("Revoke")');
  console.log(`[info] Access control buttons: ${accessBtns.length}`);

  await page.evaluate(() => window.scrollBy(0, 400));
  await page.waitForTimeout(800);
  await shot(page, '13_access_center_scrolled');

  if (accessBtns.length > 0) {
    await accessBtns[0].click();
    await page.waitForTimeout(1500);
    await shot(page, '14_access_center_modal');
    shots.push(shots[shots.length-1]);
    worked.push('Opened access control modal');

    const cancelBtn = await page.$('button:has-text("Cancel"), button:has-text("Close"), [aria-label="Close"]');
    if (cancelBtn) {
      await cancelBtn.click();
      await page.waitForTimeout(800);
      worked.push('Cancelled access center modal');
    }
  } else {
    // look for tabs
    const tabs = await page.$$('[role="tab"]');
    console.log(`[info] Access center tabs: ${tabs.length}`);
    for (let i = 0; i < Math.min(tabs.length, 4); i++) {
      await tabs[i].click();
      await page.waitForTimeout(1200);
      await shot(page, `14_access_center_tab_${i}`);

      // Check for denied-state indicators
      const deniedEls = await page.$$('[class*="denied"], [class*="reject"], [data-status="denied"], [data-status="rejected"]');
      if (deniedEls.length > 0) {
        console.log(`[info] Found denied state elements: ${deniedEls.length}`);
        worked.push(`Found denied-state UI on access center tab ${i}`);
      }
    }
  }

  // ── 5. Check for denied-state explanations ──
  // Navigate back to each page looking specifically for denied/locked states + tooltips
  await navigateTo(page, `${BASE_URL}/governance/security-matrix`, '15_matrix_denied_check');

  // Look for locked/denied visual indicators
  const lockedIcons = await page.$$('[class*="lock"], [class*="denied"], svg[title*="denied"], [aria-label*="denied"], [aria-label*="not allowed"]');
  console.log(`[info] Locked/denied icons: ${lockedIcons.length}`);

  if (lockedIcons.length > 0) {
    // Hover to see tooltip
    await lockedIcons[0].hover();
    await page.waitForTimeout(800);
    await shot(page, '16_denied_tooltip');
    worked.push('Found denied-state with lock/denied indicator');
  } else {
    failed.push('No explicit denied-state icons/tooltips found on security matrix');
  }

  // ── 6. Administration: access-center → find inspector ──
  await navigateTo(page, `${BASE_URL}/administration/access-center`, '17_access_center_inspector');
  await page.waitForTimeout(2000);

  // Look for the AccessInspector component
  const inspectorBtns = await page.$$('button:has-text("Inspect"), button:has-text("Check Access"), input[placeholder*="user"], input[placeholder*="role"]');
  console.log(`[info] Inspector controls: ${inspectorBtns.length}`);

  if (inspectorBtns.length > 0) {
    await shot(page, '18_access_inspector_found');
    worked.push('Found AccessInspector controls');

    // Try typing in the inspector
    const inputEl = await page.$('input[placeholder*="user"], input[placeholder*="role"], input[type="search"]');
    if (inputEl) {
      await inputEl.click();
      await inputEl.type('HAHA');
      await page.waitForTimeout(1200);
      await shot(page, '19_access_inspector_typed');
      worked.push('Typed in AccessInspector search');
    }
  } else {
    failed.push('AccessInspector controls not visible/accessible');
  }

  // Final full-page screenshots of each URL for transparency audit
  for (const [url, label] of [
    [`${BASE_URL}/governance/grants`, '20_grants_final'],
    [`${BASE_URL}/administration/access-center`, '21_access_center_final'],
  ]) {
    await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUT }).catch(() => {});
    await page.waitForTimeout(2000);
    await shot(page, label);
  }

  await browser.close();

  // Print summary
  console.log('\n=== SUMMARY ===');
  console.log('WORKED:', worked);
  console.log('FAILED:', failed);
  console.log('ERRORS:', errors.slice(0, 20));
  console.log('SHOTS:', shots);

  // Write JSON summary
  const summary = { worked, failed, errors: errors.slice(0, 30), shots };
  fs.writeFileSync('docs/product-readiness-audit/screens/allow-deny-flow/summary.json', JSON.stringify(summary, null, 2));
  console.log('\n[done] Summary written to docs/product-readiness-audit/screens/allow-deny-flow/summary.json');
})();
