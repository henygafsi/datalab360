/**
 * READ-ONLY Playwright audit for /explore-design
 * Covers: auth state, real data vs warming, 5xx errors, console errors,
 * mutating action buttons, permission gates, UX gaps.
 * Run: node e2e/_audit_explore-design.mjs
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const BASE = 'http://localhost:3000';
const AUTH_STATE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '.auth/state.json',
);

const findings = {
  pages_ok: 0,
  pages_warming: 0,
  pages_error: 0,
  errors_5xx: [],
  console_errors: [],
  actions: [],       // { label, selector, gated, gateType }
  approval_surfaces: [],
  ungated_actions: [],
  ux_gaps: [],
  transparency_gaps: [],
};

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForNetworkIdle(page, timeout = 6000) {
  try { await page.waitForLoadState('networkidle', { timeout }); } catch {}
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: AUTH_STATE,
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();

  // ── Collect network errors ──────────────────────────────────────────
  page.on('response', resp => {
    if (resp.status() >= 500) {
      findings.errors_5xx.push(`${resp.status()} ${resp.url()}`);
    }
  });

  // ── Collect console errors ──────────────────────────────────────────
  page.on('pageerror', err => {
    findings.console_errors.push(err.message.slice(0, 200));
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      if (!txt.includes('favicon') && !txt.includes('ERR_BLOCKED')) {
        findings.console_errors.push(`[console.error] ${txt.slice(0, 200)}`);
      }
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // 1. Load /explore-design (catalog tab)
  // ──────────────────────────────────────────────────────────────────────
  console.log('[audit] Navigating to /explore-design …');
  await page.goto(`${BASE}/explore-design`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForNetworkIdle(page, 8000);

  // Check auth redirect
  const url = page.url();
  if (url.includes('/signin') || url.includes('/login')) {
    findings.pages_error++;
    findings.errors_5xx.push('AUTH_REDIRECT: page redirected to signin');
    console.log('[audit] REDIRECTED to signin — auth state invalid');
    await browser.close();
    return;
  }

  // Check for warming / initializing text
  const bodyText = await page.innerText('body').catch(() => '');
  const isWarming = /warming up|cache is initializing|initializing cache|loading your workspace/i.test(bodyText);
  if (isWarming) {
    findings.pages_warming++;
    findings.ux_gaps.push('Catalog tab: "warming" / initializing cache message shown on load');
  } else {
    findings.pages_ok++;
  }
  console.log(`[audit] /explore-design loaded. warming=${isWarming} url=${url}`);

  // Check for real data indicators
  const hasProjectSelector = await page.locator('text=/Select a project|No project selected|Create project/i').count();
  const hasDatabaseDropdown = await page.locator('select, [role="combobox"]').count();
  console.log(`[audit] projectSelector refs=${hasProjectSelector} dbDropdown refs=${hasDatabaseDropdown}`);

  // ──────────────────────────────────────────────────────────────────────
  // 2. Enumerate top-level tab buttons (catalog / modeling)
  // ──────────────────────────────────────────────────────────────────────
  const tabButtons = await page.locator('button:has-text("Catalog"), button:has-text("Modeling")').all();
  const tabLabels = [];
  for (const tb of tabButtons) {
    tabLabels.push((await tb.innerText()).trim());
  }
  console.log('[audit] Tabs found:', tabLabels);

  // ──────────────────────────────────────────────────────────────────────
  // 3. Enumerate mutating action buttons on the catalog tab
  // ──────────────────────────────────────────────────────────────────────
  const mutatingSelectors = [
    { label: 'Add Table', sel: 'button:has-text("Add Table")' },
    { label: 'Add Column', sel: 'button:has-text("Add Column")' },
    { label: 'Create Table', sel: 'button:has-text("Create Table")' },
    { label: 'New Table', sel: 'button:has-text("New Table")' },
    { label: 'Deploy', sel: 'button:has-text("Deploy")' },
    { label: 'Deploy Changes', sel: 'button:has-text("Deploy Changes")' },
    { label: 'Publish', sel: 'button:has-text("Publish")' },
    { label: 'Apply Masking', sel: 'button:has-text("Apply Masking")' },
    { label: 'Apply RLS', sel: 'button:has-text("Apply RLS")' },
    { label: 'Manage Access', sel: 'button:has-text("Manage Access")' },
    { label: 'Grant', sel: 'button:has-text("Grant")' },
    { label: 'Revoke', sel: 'button:has-text("Revoke")' },
    { label: 'Delete', sel: 'button:has-text("Delete")' },
    { label: 'Drop', sel: 'button:has-text("Drop")' },
    { label: 'Run', sel: 'button:has-text("Run")' },
    { label: 'Save', sel: 'button:has-text("Save")' },
    { label: 'Import', sel: 'button:has-text("Import")' },
    { label: 'AI-Guided Model', sel: 'button:has-text("AI-Guided")' },
    { label: 'New Project', sel: 'button:has-text("New Project")' },
    { label: 'Create Project', sel: 'button:has-text("Create Project")' },
    { label: 'Schema Clone', sel: 'button:has-text("Clone")' },
  ];

  for (const { label, sel } of mutatingSelectors) {
    const count = await page.locator(sel).count();
    if (count > 0) {
      // Check if disabled or wrapped in a permission gate
      const firstEl = page.locator(sel).first();
      const isDisabled = await firstEl.isDisabled().catch(() => false);
      const ariaDisabled = await firstEl.getAttribute('aria-disabled').catch(() => null);
      const title = await firstEl.getAttribute('title').catch(() => null);
      const wrapper = await firstEl.evaluate(el => {
        const p = el.closest('[data-permission-gate], [data-gated]');
        return p ? p.getAttribute('data-permission-gate') || 'gated' : null;
      }).catch(() => null);

      findings.actions.push({
        label,
        count,
        disabled: isDisabled || ariaDisabled === 'true',
        permissionGate: !!wrapper,
        title: title?.slice(0, 80) || null,
      });

      if (!isDisabled && !wrapper && ['Deploy', 'Deploy Changes', 'Delete', 'Drop', 'Revoke', 'Grant'].includes(label)) {
        findings.ungated_actions.push(`${label} — visible on catalog tab, no PermissionGate wrapper detected`);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // 4. Hover on safe non-destructive buttons to inspect tooltips / modals
  // ──────────────────────────────────────────────────────────────────────
  // Try opening the AI-Guided Model button (safe, just opens a wizard)
  const aiGuidedBtn = page.locator('button:has-text("AI-Guided"), button:has-text("AI Guided"), button[aria-label*="AI"]').first();
  if (await aiGuidedBtn.count() > 0) {
    console.log('[audit] Hovering AI-Guided button …');
    await aiGuidedBtn.hover({ timeout: 3000 }).catch(() => {});
    await sleep(500);
  }

  // Try hovering on the Deploy button to see tooltip
  const deployBtn = page.locator('button:has-text("Deploy")').first();
  if (await deployBtn.count() > 0) {
    console.log('[audit] Hovering Deploy button …');
    await deployBtn.hover({ timeout: 3000 }).catch(() => {});
    await sleep(800);
    const tooltipText = await page.locator('[role="tooltip"], .tooltip, [data-tooltip]').first().innerText().catch(() => '');
    if (tooltipText) {
      console.log(`[audit] Deploy tooltip: "${tooltipText.trim()}"`);
      findings.approval_surfaces.push(`Deploy button tooltip: "${tooltipText.trim().slice(0, 120)}"`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // 5. Switch to Modeling tab
  // ──────────────────────────────────────────────────────────────────────
  const modelingTabBtn = page.locator('button:has-text("Modeling")').first();
  if (await modelingTabBtn.count() > 0) {
    console.log('[audit] Clicking Modeling tab …');
    await modelingTabBtn.click({ timeout: 5000 }).catch(() => {});
    await sleep(2000);
    await waitForNetworkIdle(page, 5000);

    const modelingUrl = page.url();
    const modelingBody = await page.innerText('body').catch(() => '');
    const modelingWarming = /warming up|cache is initializing|initializing cache/i.test(modelingBody);
    if (modelingWarming) {
      findings.pages_warming++;
      findings.ux_gaps.push('Modeling tab: warming/initializing state shown');
    } else {
      findings.pages_ok++;
    }
    console.log(`[audit] Modeling tab: warming=${modelingWarming}`);

    // Look for modeling-specific buttons
    const modelingBtns = [
      'button:has-text("Add Table")',
      'button:has-text("+ Add")',
      'button:has-text("Template")',
      'button:has-text("Import")',
    ];
    for (const sel of modelingBtns) {
      const cnt = await page.locator(sel).count();
      if (cnt > 0) {
        const txt = await page.locator(sel).first().innerText().catch(() => sel);
        if (!findings.actions.find(a => a.label === txt.trim())) {
          findings.actions.push({ label: txt.trim(), count: cnt, disabled: false, permissionGate: false, title: null });
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // 6. Check for empty-state / 4-states coverage
  // ──────────────────────────────────────────────────────────────────────
  const hasEmptyState = await page.locator('text=/no tables|empty|get started|add your first/i').count();
  const hasErrorState = await page.locator('text=/something went wrong|failed to load|error loading/i').count();
  const hasSkeletonLoader = await page.locator('[class*="skeleton"], [class*="animate-pulse"], [class*="shimmer"]').count();

  console.log(`[audit] emptyState=${hasEmptyState} errorState=${hasErrorState} skeletonLoader=${hasSkeletonLoader}`);
  if (hasEmptyState === 0) {
    findings.ux_gaps.push('No empty-state UI detected — unclear if 4-states (loading/empty/error/data) are all covered');
  }

  // ──────────────────────────────────────────────────────────────────────
  // 7. Dark mode check (look for dark: classes applied)
  // ──────────────────────────────────────────────────────────────────────
  const hasDarkClasses = await page.evaluate(() => {
    const els = document.querySelectorAll('[class]');
    for (const el of els) {
      if (el.className && el.className.includes && el.className.includes('dark:')) return true;
    }
    return false;
  }).catch(() => false);
  if (!hasDarkClasses) {
    findings.ux_gaps.push('No dark: Tailwind classes detected in DOM — dark mode may not be applied');
  }

  // ──────────────────────────────────────────────────────────────────────
  // 8. Vendor name leak scan in visible text
  // ──────────────────────────────────────────────────────────────────────
  const visibleText = await page.evaluate(() => document.body.innerText).catch(() => '');
  if (/snowflake/i.test(visibleText)) {
    // Extract context
    const matches = [...visibleText.matchAll(/(.{0,40}snowflake.{0,40})/gi)].slice(0, 3);
    for (const m of matches) {
      findings.ux_gaps.push(`Vendor name "Snowflake" visible in UI: "…${m[1].trim()}…"`);
    }
  }
  if (/cortex/i.test(visibleText)) {
    const matches = [...visibleText.matchAll(/(.{0,40}cortex.{0,40})/gi)].slice(0, 2);
    for (const m of matches) {
      findings.ux_gaps.push(`Vendor name "Cortex" visible in UI: "…${m[1].trim()}…"`);
    }
  }
  if (/kimi/i.test(visibleText)) {
    findings.ux_gaps.push('Vendor name "Kimi" visible in UI');
  }

  // ──────────────────────────────────────────────────────────────────────
  // 9. Permission gate / approval surface check
  // ──────────────────────────────────────────────────────────────────────
  const permissionGateEls = await page.locator('[data-permission-gate]').count();
  const permDeniedText = await page.locator('text="You lack the"').count() +
    await page.locator('text="not allowed"').count() +
    await page.locator('text="access denied"').count();
  if (permissionGateEls > 0 || permDeniedText > 0) {
    findings.approval_surfaces.push(`PermissionGate / permission-denied text visible (gates=${permissionGateEls}, text=${permDeniedText})`);
  }

  // Check for Manage Access (grant/deny controls)
  const manageAccessBtns = await page.locator('button:has-text("Manage Access"), button:has-text("Access Control")').count();
  if (manageAccessBtns > 0) {
    findings.approval_surfaces.push(`ManageAccess button present (${manageAccessBtns}x) — per-project/module grant surface`);
  }

  // ──────────────────────────────────────────────────────────────────────
  // 10. Check for popup vs docked panel usage
  // ──────────────────────────────────────────────────────────────────────
  const modalOverlays = await page.locator('[role="dialog"], .modal-overlay, [class*="Modal"]').count();
  console.log(`[audit] Modal overlays visible: ${modalOverlays}`);
  if (modalOverlays > 0) {
    findings.ux_gaps.push(`${modalOverlays} modal overlay(s) visible at rest — consider docked panel pattern`);
  }

  // ──────────────────────────────────────────────────────────────────────
  // 11. Check transparency for denied access
  // ──────────────────────────────────────────────────────────────────────
  const grantedText = await page.locator('text="granted"').count() + await page.locator('text="Access Granted"').count();
  const deniedText = await page.locator('text="denied"').count() + await page.locator('text="forbidden"').count();
  if (deniedText === 0 && grantedText === 0) {
    findings.transparency_gaps.push('No explicit granted/denied access status shown to the user — denied-vs-permitted not surfaced');
  }

  // ──────────────────────────────────────────────────────────────────────
  // Done
  // ──────────────────────────────────────────────────────────────────────
  await browser.close();

  console.log('\n=== AUDIT FINDINGS ===');
  console.log(JSON.stringify(findings, null, 2));
}

run().catch(err => {
  console.error('[audit] Fatal error:', err);
  process.exit(1);
});
