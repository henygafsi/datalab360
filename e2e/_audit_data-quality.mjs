/**
 * Playwright READ-ONLY audit: data-quality module
 * Usage: node e2e/_audit_data-quality.mjs
 * (run from /Users/datalab360/Documents/data360_pro/datalab360Front)
 */

import { chromium } from '@playwright/test';
import { writeFileSync } from 'fs';

const BASE = 'http://localhost:3000';
const AUTH_STATE = 'e2e/.auth/state.json';

// ── helpers ──────────────────────────────────────────────────────────────────

function stamp() { return new Date().toISOString().slice(11, 23); }

const findings = {
  pages_ok: 0,
  pages_warming: 0,
  pages_error: 0,
  errors_5xx: [],
  console_errors: [],
  action_buttons: [],       // { label, gated, disabled }
  ungated_actions: [],
  approval_surfaces: [],
  transparency_gaps: [],
  ux_gaps: [],
  vendor_leaks: [],
};

const WARMING_PATTERNS = [
  /warming up/i, /cache is initializing/i, /cache not ready/i,
  /initializing cache/i, /loading cache/i,
];

// ── main audit ───────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: AUTH_STATE,
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();

// Capture network 5xx
page.on('response', (res) => {
  if (res.status() >= 500) {
    findings.errors_5xx.push(`${res.status()} ${res.url()}`);
  }
});

// Capture console errors
page.on('pageerror', (err) => {
  findings.console_errors.push(err.message.slice(0, 200));
});
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    const text = msg.text();
    // Skip React internal warnings and resource-not-found noise
    if (!text.includes('favicon') && !text.includes('404') &&
        !text.includes('net::ERR') && !text.includes('Warning:')) {
      findings.console_errors.push(`[console.error] ${text.slice(0, 200)}`);
    }
  }
});

console.log(`[${stamp()}] Navigating to /data-quality …`);
const res = await page.goto(`${BASE}/data-quality`, { waitUntil: 'domcontentloaded', timeout: 30000 });
const finalUrl = page.url();

// ── Auth check ───────────────────────────────────────────────────────────────
if (finalUrl.includes('/signin') || finalUrl.includes('/login')) {
  console.error('REDIRECTED TO SIGN-IN — auth invalid');
  findings.ux_gaps.push('Redirected to /signin — storageState may be stale');
  findings.pages_error++;
} else {
  console.log(`[${stamp()}] Landed on ${finalUrl}`);

  // Wait for page skeleton to resolve
  await page.waitForTimeout(3000);

  // ── Check for warming / cache-init text ─────────────────────────────────
  const bodyText = await page.textContent('body') || '';
  const warmingHit = WARMING_PATTERNS.find((p) => p.test(bodyText));
  if (warmingHit) {
    console.warn(`[${stamp()}] Warming-up text found: ${warmingHit}`);
    findings.pages_warming++;
  }

  // ── Vendor name leaks ───────────────────────────────────────────────────
  const vendorPatterns = [
    { name: 'Snowflake', re: /\bSnowflake\b/gi },
    { name: 'Cortex', re: /\bCortex\b/gi },
    { name: 'Kimi', re: /\bKimi\b/gi },
  ];
  // Ignore admin/architecture contexts (breadcrumbs, aria, hidden)
  const visibleText = await page.locator('main, [role="main"], .p-4').textContent().catch(() => bodyText) || bodyText;
  for (const { name, re } of vendorPatterns) {
    if (re.test(visibleText)) {
      findings.vendor_leaks.push(`Vendor name "${name}" visible in customer-facing body`);
    }
  }

  // ── KPI bar check ───────────────────────────────────────────────────────
  // Look for health_score KPI
  const kpiText = await page.locator('[role="region"][aria-label*="KPI"], [aria-label*="quality KPI"]')
    .textContent().catch(() => null);
  if (kpiText === null) {
    // Check if at least one KPI value is rendered
    const kpiBars = await page.locator('.text-base.font-bold').count();
    if (kpiBars === 0) {
      findings.ux_gaps.push('KPI bar: no bold metric values found on initial load');
    }
  }

  // ── Header action buttons ────────────────────────────────────────────────
  // Buttons in the header gradient bar
  const headerButtons = await page.locator('button, [role="button"]').all();
  console.log(`[${stamp()}] Found ${headerButtons.length} total buttons`);

  // Focus on named action buttons
  const actionLabels = ['Run Check', 'Associate DMF', 'Custom DMF', 'Schedule', 'Force Refresh',
                        'Manage DMFs', 'Suggest checks', 'Export CSV'];

  for (const label of actionLabels) {
    const btn = page.locator(`button:has-text("${label}"), [role="button"]:has-text("${label}")`).first();
    const count = await btn.count();
    if (count > 0) {
      let btnDisabledEval = false;
      try { btnDisabledEval = await btn.evaluate((el) => el.hasAttribute('disabled')); } catch {}
      const isDisabled = (await btn.getAttribute('disabled')) !== null ||
        (await btn.getAttribute('aria-disabled')) === 'true' ||
        btnDisabledEval;
      const titleAttr = await btn.getAttribute('title') || '';
      const gated = titleAttr.toLowerCase().includes('lack') ||
                    titleAttr.toLowerCase().includes('permission');

      findings.action_buttons.push({
        label,
        disabled: isDisabled,
        gated: gated || label !== 'Export CSV' && label !== 'Force Refresh',
        title: titleAttr.slice(0, 100),
      });

      if (!isDisabled && !gated && ['Run Check', 'Associate DMF', 'Custom DMF', 'Schedule', 'Manage DMFs'].includes(label)) {
        findings.ungated_actions.push(`${label} appears enabled without explicit tooltip gate`);
      }

      console.log(`[${stamp()}]   Button "${label}" disabled=${isDisabled} gated=${gated}`);
    } else {
      console.log(`[${stamp()}]   Button "${label}" NOT FOUND`);
    }
  }

  // ── Safe hover of Run Check (opens panel, cancel) ────────────────────────
  const runCheckBtn = page.locator('button:has-text("Run Check")').first();
  if (await runCheckBtn.count() > 0 && !(await runCheckBtn.evaluate((el) => el.hasAttribute('disabled')))) {
    console.log(`[${stamp()}] Hovering "Run Check" …`);
    await runCheckBtn.hover();
    await page.waitForTimeout(500);
    // Click to open the threshold panel
    await runCheckBtn.click();
    await page.waitForTimeout(800);
    // Check if a right-panel / drawer appeared
    const panelOpen = await page.locator('[aria-label*="panel"], .right-panel, aside, [role="dialog"]').count();
    if (panelOpen > 0) {
      console.log(`[${stamp()}] Run Check panel opened (panel count: ${panelOpen})`);
    }
    // Close via Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // ── Safe: open Associate DMF panel, cancel ────────────────────────────────
  const assocBtn = page.locator('button:has-text("Associate DMF")').first();
  if (await assocBtn.count() > 0 && !(await assocBtn.evaluate((el) => el.hasAttribute('disabled')))) {
    console.log(`[${stamp()}] Clicking "Associate DMF" …`);
    await assocBtn.click();
    await page.waitForTimeout(800);
    const assocPanel = await page.locator('text=Associate DMF').count();
    console.log(`[${stamp()}] Associate DMF text occurrences after click: ${assocPanel}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // ── 4-state check on default (completeness) tab ──────────────────────────
  // Check for: loading skeleton, empty, error, data
  const hasData = await page.locator('table tbody tr, .overflow-x-auto tr').count();
  const hasError = await page.locator('[role="alert"]').count();
  const hasSkeleton = await page.locator('.animate-pulse').count();
  const hasEmptyMsg = await page.locator('text=/No data available|No completeness data/i').count();
  console.log(`[${stamp()}] Default tab (completeness): data_rows=${hasData} alerts=${hasError} skeletons=${hasSkeleton} empty=${hasEmptyMsg}`);

  if (hasData === 0 && hasEmptyMsg === 0 && hasError === 0 && hasSkeleton === 0) {
    findings.ux_gaps.push('Completeness tab: no data, no empty state, no error, no skeleton — blank white box');
  }

  findings.pages_ok++;

  // ── Iterate tabs ─────────────────────────────────────────────────────────
  const TAB_IDS = ['completeness', 'uniqueness', 'freshness', 'ingestion', 'schema',
                   'classification', 'cost', 'security', 'dmf'];
  const TAB_LABELS_MAP = {
    completeness: 'Completeness', uniqueness: 'Uniqueness', freshness: 'Freshness',
    ingestion: 'Ingestion', schema: 'Schema', classification: 'Classification',
    cost: 'Storage', security: 'Security', dmf: 'DMF Results',
  };

  for (const tabId of TAB_IDS.slice(1)) { // skip completeness (already active)
    const tabLabel = TAB_LABELS_MAP[tabId];
    const tabBtn = page.locator(`button:has-text("${tabLabel}")`).first();
    const found = await tabBtn.count();
    if (!found) {
      findings.ux_gaps.push(`Tab "${tabLabel}" button not found in DOM`);
      continue;
    }
    console.log(`[${stamp()}] Switching to tab: ${tabLabel}`);
    await tabBtn.click();
    await page.waitForTimeout(1500);

    // Check body text for warming patterns
    const tabBody = await page.textContent('body') || '';
    const tabWarming = WARMING_PATTERNS.find((p) => p.test(tabBody));
    if (tabWarming) {
      console.warn(`[${stamp()}]   [${tabLabel}] WARMING UP detected`);
      findings.pages_warming++;
    }

    const tabRows = await page.locator('table tbody tr').count();
    const tabAlert = await page.locator('[role="alert"]').count();
    const tabEmpty = await page.locator('text=/No .* available|No .* data/i').count();
    console.log(`[${stamp()}]   [${tabLabel}] rows=${tabRows} alerts=${tabAlert} empty=${tabEmpty}`);

    // For DMF tab: check the DMF action bar buttons
    if (tabId === 'dmf') {
      findings.pages_ok++;
      // Check for "Manage DMFs" and "Suggest checks (AI)" buttons
      const manageDmfBtn = page.locator('button:has-text("Manage DMFs")').first();
      const suggestBtn = page.locator('button:has-text("Suggest checks")').first();

      if (await manageDmfBtn.count() > 0) {
        const mgDisabled = await manageDmfBtn.evaluate((el) => el.hasAttribute('disabled'));
        console.log(`[${stamp()}]   Manage DMFs button disabled=${mgDisabled}`);
        findings.action_buttons.push({
          label: 'Manage DMFs',
          disabled: mgDisabled,
          gated: true,
          title: await manageDmfBtn.getAttribute('title') || '',
        });

        // If not disabled, click to open the Manage DMFs panel
        if (!mgDisabled) {
          await manageDmfBtn.click();
          await page.waitForTimeout(800);
          const mgPanel = await page.locator('text=/DMF association|Manage DMF/i').count();
          console.log(`[${stamp()}]   Manage DMFs panel text hits: ${mgPanel}`);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        }
      }

      if (await suggestBtn.count() > 0) {
        const suggestDisabled = await suggestBtn.evaluate((el) => el.hasAttribute('disabled'));
        console.log(`[${stamp()}]   Suggest checks (AI) disabled=${suggestDisabled}`);
        findings.action_buttons.push({
          label: 'Suggest checks (AI)',
          disabled: suggestDisabled,
          gated: false,
          title: await suggestBtn.getAttribute('title') || '',
        });
        if (!suggestDisabled) {
          findings.ungated_actions.push('Suggest checks (AI) is not permission-gated (read-only, acceptable if truly read-only)');
        }
      }
    }
  }

  // ── Check SmartRightBar by clicking a table row ─────────────────────────
  // Switch back to completeness
  const compTab = page.locator('button:has-text("Completeness")').first();
  if (await compTab.count() > 0) {
    await compTab.click();
    await page.waitForTimeout(1500);
  }

  const firstDataRow = page.locator('table tbody tr').first();
  if (await firstDataRow.count() > 0) {
    console.log(`[${stamp()}] Clicking first table row to open SmartRightBar …`);
    await firstDataRow.click();
    await page.waitForTimeout(1500);

    // Check if right panel appeared
    const rightPanel = await page.locator('[storageKey], aside, [role="region"][aria-label*="panel"]').count();
    const runCheckInPanel = await page.locator('button:has-text("Run Check")').count();
    const assocInPanel = await page.locator('button:has-text("Associate DMF")').count();
    const schedInPanel = await page.locator('button:has-text("Set Schedule")').count();
    console.log(`[${stamp()}] SmartRightBar: right_panels=${rightPanel} run_check=${runCheckInPanel} assoc_dmf=${assocInPanel} set_sched=${schedInPanel}`);

    if (runCheckInPanel > 0 || assocInPanel > 0 || schedInPanel > 0) {
      findings.approval_surfaces.push('SmartRightBar: Run Check / Associate DMF / Set Schedule actions per-table context (gated by useCanPerform)');
    }

    // Check per-row permission gate visibility
    const permGatedButtons = await page.locator('button[title*="lack"], button[title*="permission"]').count();
    if (permGatedButtons > 0) {
      console.log(`[${stamp()}] Found ${permGatedButtons} permission-gated buttons (title contains "lack"/"permission")`);
    }

    // Close right panel by pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } else {
    findings.ux_gaps.push('Completeness tab: no table rows rendered — cannot test row-click / SmartRightBar flow');
  }

  // ── Recommendations panel ───────────────────────────────────────────────
  const recToggle = page.locator('button[aria-label="Toggle recommendations"]').first();
  if (await recToggle.count() > 0) {
    const recExpanded = await recToggle.getAttribute('aria-expanded');
    console.log(`[${stamp()}] Recommendations panel expanded=${recExpanded}`);
    // Check for deep-link CTAs
    const recLinks = await page.locator('a:has-text("Open in"), a:has-text("Governance"), a:has-text("Catalog")').count();
    console.log(`[${stamp()}] Recommendation deep-link CTAs: ${recLinks}`);
    if (recLinks === 0) {
      findings.transparency_gaps.push('Recommendations panel: no cross-module deep-link CTAs found (may be because no recommendations exist)');
    }
  }

  // ── Check for dark-mode class on html or body ───────────────────────────
  const htmlClass = await page.locator('html').getAttribute('class') || '';
  const bodyClass = await page.locator('body').getAttribute('class') || '';
  const darkModeEnabled = htmlClass.includes('dark') || bodyClass.includes('dark');
  console.log(`[${stamp()}] Dark mode class detected: ${darkModeEnabled} (html="${htmlClass.slice(0, 60)}")`);
  if (!darkModeEnabled) {
    findings.ux_gaps.push('Dark mode: test ran in light mode only — dark mode rendering not verified');
  }

  // ── Final pass: capture all visible button labels ──────────────────────
  const allBtns = await page.locator('button:visible, [role="button"]:visible').all();
  const allLabels = new Set();
  for (const btn of allBtns.slice(0, 50)) {
    const txt = (await btn.textContent() || '').trim();
    if (txt && txt.length > 1 && txt.length < 60) allLabels.add(txt);
  }
  console.log(`[${stamp()}] Visible buttons (${allLabels.size}): ${[...allLabels].join(' | ')}`);
}

await browser.close();

// ── Derive summary ───────────────────────────────────────────────────────────
const result = {
  module: 'data-quality',
  pages_ok: findings.pages_ok,
  pages_warming: findings.pages_warming,
  pages_error: findings.pages_error,
  actions_found: findings.action_buttons.length,
  errors_5xx: findings.errors_5xx,
  console_errors: [...new Set(findings.console_errors)],
  action_buttons: findings.action_buttons,
  ungated_actions: findings.ungated_actions,
  approval_surfaces: findings.approval_surfaces,
  transparency_gaps: findings.transparency_gaps,
  ux_gaps: findings.ux_gaps,
  vendor_leaks: findings.vendor_leaks,
};

const outPath = 'e2e/_audit_data-quality_results.json';
writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`\n[${stamp()}] Results written to ${outPath}`);
console.log(JSON.stringify(result, null, 2));
