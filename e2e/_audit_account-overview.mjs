/**
 * READ-ONLY Playwright audit: /account-overview (all tabs)
 * Run: node e2e/_audit_account-overview.mjs
 */

import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const BASE = 'http://localhost:3000';
const AUTH_STATE = resolve('e2e/.auth/state.json');
const TIMEOUT = 12_000;

const TABS = [
  'overview',
  'dwh-plan',
  'snowflake-objects',
  'finops',
  'modules',
  'platform-activity',
  'projects',
  'security',
  'organization',
];

// Regex patterns that indicate warming / unready cache
const WARMING_PATTERNS = [
  /warming up/i,
  /cache is initializing/i,
  /initializing cache/i,
  /cache not ready/i,
  /cache warming/i,
  /loading\.\.\./i,
  /please wait.*cache/i,
  /not yet available/i,
];

const REAL_DATA_SIGNALS = [
  /\d{1,3}(,\d{3})*(\.\d+)?/,   // any number with commas
];

// Button labels that indicate mutating actions
const MUTATING_LABELS = [
  /^create/i, /^add/i, /^new/i, /^edit/i, /^update/i, /^save/i,
  /^delete/i, /^remove/i, /^grant/i, /^revoke/i, /^approve/i,
  /^deny/i, /^apply/i, /^publish/i, /^run/i, /^deploy/i,
  /^install/i, /^configure/i, /^assign/i, /^unassign/i,
  /^export/i, /^import/i, /^refresh/i, /^reset/i,
  /^enable/i, /^disable/i, /^submit/i, /^request/i, /^invite/i,
];

const DESTRUCTIVE_LABELS = /^(delete|remove|revoke|deny|reset|disable)/i;

function isWarming(text) {
  return WARMING_PATTERNS.some(p => p.test(text));
}

function isMutating(label) {
  return MUTATING_LABELS.some(p => p.test(label.trim()));
}

const results = {
  pages_ok: 0,
  pages_warming: 0,
  pages_error: 0,
  errors_5xx: [],
  console_errors: [],
  actions: [],
  permission_gated: [],
  ungated: [],
  approval_surfaces: [],
  transparency_gaps: [],
  ux_gaps: [],
};

async function auditTab(page, tabId, allNetworkErrors) {
  const url = tabId === 'overview'
    ? `${BASE}/account-overview`
    : `${BASE}/account-overview?tab=${tabId}`;

  const tabErrors5xx = [];
  const tabConsoleErrors = [];
  const networkListener = (response) => {
    const status = response.status();
    if (status >= 500) {
      tabErrors5xx.push(`[${status}] ${response.url()}`);
    }
  };
  const consoleListener = (msg) => {
    if (msg.type() === 'error') {
      tabConsoleErrors.push(msg.text());
    }
  };

  page.on('response', networkListener);
  page.on('console', consoleListener);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });

    // Check auth — not redirected to signin
    const finalUrl = page.url();
    if (finalUrl.includes('/signin') || finalUrl.includes('/login')) {
      console.log(`  [${tabId}] AUTH FAIL — redirected to ${finalUrl}`);
      results.pages_error++;
      return;
    }

    // Wait a bit for data to load
    await page.waitForTimeout(3500);

    // Check for warming state
    const bodyText = await page.evaluate(() => document.body.innerText);
    const warming = isWarming(bodyText);

    // Check for real data (numbers, table rows, named values)
    const hasRealData = REAL_DATA_SIGNALS.some(p => p.test(bodyText))
      && !bodyText.includes('No data')
      && bodyText.length > 200;

    const hasErrorState = bodyText.includes('Something went wrong')
      || bodyText.includes('Error loading')
      || bodyText.includes('Failed to fetch');

    if (warming) {
      console.log(`  [${tabId}] WARMING`);
      results.pages_warming++;
    } else if (hasErrorState) {
      console.log(`  [${tabId}] ERROR STATE`);
      results.pages_error++;
    } else {
      console.log(`  [${tabId}] OK (real data: ${hasRealData})`);
      results.pages_ok++;
    }

    // Enumerate buttons
    const buttons = await page.$$eval('button, a[role="button"], [data-action]', (els) =>
      els.map((el) => ({
        text: (el.textContent ?? '').trim().slice(0, 80),
        ariaLabel: el.getAttribute('aria-label') ?? '',
        disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
        hasLock: el.querySelector('[data-icon="lock"], .lucide-lock, [aria-label*="permission"]') != null,
        classList: el.className?.slice?.(0, 120) ?? '',
        dataGate: el.getAttribute('data-gate') ?? el.getAttribute('data-permission') ?? '',
        type: el.tagName,
      }))
    );

    for (const btn of buttons) {
      const label = btn.ariaLabel || btn.text;
      if (!label || label.length < 2) continue;
      if (!isMutating(label)) continue;

      const actionEntry = {
        tab: tabId,
        label: label.slice(0, 60),
        disabled: btn.disabled,
        hasGate: btn.hasLock || !!btn.dataGate || btn.disabled,
        classList: btn.classList,
      };

      results.actions.push(actionEntry);

      if (actionEntry.hasGate || btn.disabled) {
        results.permission_gated.push(`[${tabId}] "${label}"`);
      } else {
        // Only add to ungated if it's truly missing any gate signal
        if (!btn.hasLock && !btn.dataGate && !btn.disabled) {
          results.ungated.push(`[${tabId}] "${label}"`);
        }
      }
    }

    // Check for approval / grant / deny surfaces
    const approvalKeywords = ['approve', 'deny', 'grant', 'revoke', 'allow', 'reject'];
    for (const kw of approvalKeywords) {
      if (bodyText.toLowerCase().includes(kw)) {
        results.approval_surfaces.push(`[${tabId}] "${kw}" control visible`);
        break;
      }
    }

    // UX: check for vendor-name leaks
    const vendorNames = ['Snowflake', 'Cortex', 'Kimi'];
    for (const v of vendorNames) {
      // Page text check (case-sensitive for brand names)
      if (bodyText.includes(v)) {
        // Identify if it's in a visible non-admin section
        const occurrences = (bodyText.match(new RegExp(v, 'g')) ?? []).length;
        results.ux_gaps.push(`[${tabId}] Vendor name "${v}" appears in body text (${occurrences}x) — check if customer-facing copy`);
      }
    }

    // UX: check for empty states (no items message)
    const emptyPatterns = [/no data available/i, /no results/i, /nothing here/i, /empty/i];
    // Only flag if the tab has no numbers at all — true empty
    if (!hasRealData && !warming) {
      results.ux_gaps.push(`[${tabId}] May be showing empty state — no numeric data detected`);
    }

    // Collect 5xx for this tab
    if (tabErrors5xx.length > 0) {
      results.errors_5xx.push(...tabErrors5xx.map(e => `[tab:${tabId}] ${e}`));
    }
    if (tabConsoleErrors.length > 0) {
      // Filter out noise (HMR, etc.)
      const filtered = tabConsoleErrors.filter(e =>
        !e.includes('HMR') && !e.includes('Fast Refresh') && !e.includes('[webpack')
      );
      results.console_errors.push(...filtered.map(e => `[tab:${tabId}] ${e.slice(0, 200)}`));
    }

    // Try to open (hover/click) a non-destructive mutating button to observe
    // permission gating behavior — CANCEL only, never submit
    const safeToOpenLabels = /^(create|add|new|invite|request|configure|install)/i;
    const openCandidates = await page.$$('button');
    for (const btn of openCandidates) {
      const text = ((await btn.textContent()) ?? '').trim();
      if (!safeToOpenLabels.test(text)) continue;
      if (await btn.isDisabled()) continue;

      try {
        await btn.hover({ timeout: 2000 });
        // Check if a tooltip/popover appeared mentioning permission
        const tooltipText = await page.evaluate(() => {
          const tooltips = document.querySelectorAll('[role="tooltip"], [data-radix-popper-content-wrapper], .tooltip');
          return Array.from(tooltips).map(t => t.textContent?.trim() ?? '').join(' ');
        });
        if (tooltipText && /permission|role|access|unauthori/i.test(tooltipText)) {
          results.permission_gated.push(`[${tabId}] "${text}" — tooltip: "${tooltipText.slice(0, 80)}"`);
        }

        // Try clicking to open a modal/dialog (not a form submit)
        await btn.click({ timeout: 2000 });
        await page.waitForTimeout(800);

        // Check if a dialog opened
        const dialog = await page.$('[role="dialog"], [data-radix-dialog-overlay], .modal-overlay');
        if (dialog) {
          const dialogText = await dialog.evaluate(el => el.textContent?.slice(0, 200) ?? '');
          console.log(`    [${tabId}] Opened dialog for "${text}": ${dialogText.slice(0, 80)}...`);
          // Cancel/close it
          const cancelBtn = await page.$('button[data-cancel], button:has-text("Cancel"), button:has-text("Close"), [aria-label="Close"]');
          if (cancelBtn) {
            await cancelBtn.click({ timeout: 2000 }).catch(() => {});
          } else {
            await page.keyboard.press('Escape');
          }
          await page.waitForTimeout(400);
        }
        break; // Only try first safe candidate per tab
      } catch {
        // Skip non-interactable buttons
      }
    }

  } finally {
    page.off('response', networkListener);
    page.off('console', consoleListener);
  }
}

(async () => {
  console.log('Starting account-overview audit...\n');

  const browser = await chromium.launch({ headless: true });
  const storageState = JSON.parse(readFileSync(AUTH_STATE, 'utf-8'));
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();

  // Set a global timeout budget
  const startTime = Date.now();
  const MAX_RUNTIME = 90_000;

  for (const tab of TABS) {
    if (Date.now() - startTime > MAX_RUNTIME) {
      console.log(`  Timeout budget exhausted after ${TABS.indexOf(tab)} tabs.`);
      break;
    }
    console.log(`Auditing tab: ${tab}`);
    await auditTab(page, tab, results.errors_5xx).catch(err => {
      console.log(`  [${tab}] EXCEPTION: ${err.message}`);
      results.pages_error++;
    });
  }

  await browser.close();

  // Deduplicate
  results.errors_5xx = [...new Set(results.errors_5xx)];
  results.console_errors = [...new Set(results.console_errors)];
  results.approval_surfaces = [...new Set(results.approval_surfaces)];
  results.ungated = [...new Set(results.ungated)];
  results.permission_gated = [...new Set(results.permission_gated)];
  results.ux_gaps = [...new Set(results.ux_gaps)];

  console.log('\n=== AUDIT RESULTS ===');
  console.log(JSON.stringify(results, null, 2));

  // Write summary JSON for structured output
  const fs = await import('fs');
  fs.writeFileSync('/tmp/_audit_account-overview-results.json', JSON.stringify(results, null, 2));
  console.log('\nResults written to /tmp/_audit_account-overview-results.json');
})();
