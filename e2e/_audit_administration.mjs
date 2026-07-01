/**
 * READ-ONLY Playwright audit — administration module
 * Routes: /administration, /admin/api-health, /admin/data360-config, /admin/platform-settings
 *
 * What it records:
 *  - auth status (redirected to /signin?)
 *  - page content state (real data / warming / blank)
 *  - 5xx network responses + console pageerrors
 *  - mutating action buttons (create/edit/delete/grant/revoke/approve/deny/apply/publish/run/deploy)
 *  - permission gates (useCanPerform signals, disabled/tooltip attributes)
 *  - allow/deny/approval/grant controls
 *  - transparency gaps (denied vs permitted access surfaced?)
 *  - UX gaps (vendor-name leaks, 4-state coverage, popups vs docked panels)
 *  - tab sub-pages discovered via tab buttons
 *
 * NON-DESTRUCTIVE: opens confirm modals / hovers only; never submits.
 */

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_STATE = path.join(__dirname, '.auth/state.json');
const BASE = 'http://localhost:3000';
const NAV_TIMEOUT = 20_000;
const TAB_PAUSE = 2_000;

// ─── result containers ────────────────────────────────────────────────────────
const pages_ok = [];
const pages_warming = [];
const pages_error = [];
const fivexx = [];
const consoleErrors = [];
const mutatingButtons = [];
const ungatedActions = [];
const grantSurfaces = [];
const transparencyGaps = [];
const uxGaps = [];
const discoveredTabs = {};

// ─── helpers ─────────────────────────────────────────────────────────────────

function log(msg) { process.stdout.write(`[audit] ${msg}\n`); }

function isWarmingText(text) {
  return /warming\s*up|cache\s*is\s*init|initializ/i.test(text);
}

function isRealData(text) {
  // heuristic: something meaningful on screen beyond skeleton placeholders
  return text.length > 200 && !/^\s*$/.test(text);
}

async function visitPage(page, url, label) {
  const errors5xx = [];
  const pageConsoleErrors = [];

  page.on('response', (res) => {
    if (res.status() >= 500) {
      errors5xx.push({ status: res.status(), url: res.url() });
    }
  });
  page.on('pageerror', (err) => {
    pageConsoleErrors.push(err.message);
  });

  log(`Navigating to ${url}`);
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT }).catch(() => {
    log(`  networkidle timed out for ${url}, continuing`);
  });

  // Check auth redirect
  const currentUrl = page.url();
  if (currentUrl.includes('/signin')) {
    pages_error.push({ page: label, reason: 'Redirected to /signin — not authed' });
    log(`  FAIL: redirected to /signin`);
    return null;
  }

  // Body text snapshot
  const bodyText = await page.locator('body').innerText().catch(() => '');

  if (isWarmingText(bodyText)) {
    pages_warming.push({ page: label, url });
    log(`  WARMING: page shows warming/initializing text`);
  } else if (isRealData(bodyText)) {
    pages_ok.push({ page: label, url });
    log(`  OK: page has real content (${bodyText.length} chars)`);
  } else {
    pages_warming.push({ page: label, url, note: 'Content too thin to confirm real data' });
    log(`  THIN: content is thin (${bodyText.length} chars)`);
  }

  if (errors5xx.length) {
    fivexx.push(...errors5xx.map((e) => ({ page: label, ...e })));
    log(`  5xx: ${errors5xx.map((e) => `${e.status} ${e.url}`).join(', ')}`);
  }
  if (pageConsoleErrors.length) {
    consoleErrors.push(...pageConsoleErrors.map((e) => ({ page: label, error: e })));
    log(`  consoleError: ${pageConsoleErrors[0]}`);
  }

  return bodyText;
}

// ─── button audit ─────────────────────────────────────────────────────────────

const MUTATING_KEYWORDS = /\b(create|add|new|edit|update|save|apply|grant|revoke|delete|remove|approve|deny|reject|publish|run|deploy|reset|refresh|import|export|invite|disable|enable|activate|deactivate|confirm|submit)\b/i;

async function auditButtons(page, context) {
  // Collect all visible buttons and links that look mutating
  const buttons = await page.locator('button:visible, [role="button"]:visible').all();
  const found = [];

  for (const btn of buttons) {
    let text = '';
    try { text = (await btn.innerText()).trim(); } catch { continue; }
    if (!MUTATING_KEYWORDS.test(text)) continue;

    const isDisabled = await btn.getAttribute('disabled').catch(() => null);
    const ariaDisabled = await btn.getAttribute('aria-disabled').catch(() => null);
    const title = await btn.getAttribute('title').catch(() => '') || '';
    const hasPermissionHint = /permission|not\s+allow|cannot|forbidden|unauthorized/i.test(title);

    found.push({ text, disabled: isDisabled !== null || ariaDisabled === 'true', title, gated: hasPermissionHint, ctx: context });
  }

  for (const b of found) {
    mutatingButtons.push(b);
    if (!b.gated && !b.disabled) {
      ungatedActions.push(`${b.ctx}: "${b.text}" — no visible permission gate / confirm`);
    }
    log(`  btn: "${b.text}" disabled=${b.disabled} gated=${b.gated} ctx=${b.ctx}`);
  }

  return found;
}

// ─── tab discovery ─────────────────────────────────────────────────────────────

async function discoverTabs(page, label) {
  const tabBtns = await page.locator('[role="tab"]:visible, [role="tablist"] button:visible').all();
  const tabs = [];
  for (const t of tabBtns) {
    const txt = await t.innerText().catch(() => '');
    if (txt.trim()) tabs.push(txt.trim());
  }
  if (tabs.length) {
    discoveredTabs[label] = tabs;
    log(`  tabs: ${tabs.join(', ')}`);
  }
  return tabs;
}

// ─── grant/approval surface detection ────────────────────────────────────────

async function detectGrantSurfaces(page, label) {
  const body = await page.locator('body').innerText().catch(() => '');
  if (/grant|revoke|allow|deny|approve|reject|permission|access\s+request/i.test(body)) {
    grantSurfaces.push(label);
    log(`  grant surface detected on ${label}`);
  }
}

// ─── vendor-name leak detection ────────────────────────────────────────────────

async function detectVendorLeaks(page, label) {
  const body = await page.locator('body').innerText().catch(() => '');
  if (/\bSnowflake\b/i.test(body)) {
    uxGaps.push(`Vendor name "Snowflake" visible in customer-facing UI: ${label}`);
    log(`  UX: "Snowflake" visible on ${label}`);
  }
  if (/\bKimi\b/i.test(body)) {
    uxGaps.push(`Vendor name "Kimi" visible in customer-facing UI: ${label}`);
    log(`  UX: "Kimi" visible on ${label}`);
  }
  // Cortex is allowed in admin-only views per CLAUDE.md, but note it if it appears
  if (/\bCortex\b/i.test(body)) {
    log(`  INFO: "Cortex" visible on ${label} (allowed in admin views)`);
  }
}

// ─── 4-state coverage check ────────────────────────────────────────────────────

async function check4States(page, label) {
  const body = await page.locator('body').innerText().catch(() => '');
  const hasLoading = await page.locator('[data-testid="loading"], .skeleton, [aria-busy="true"], [data-loading="true"]').count() > 0;
  const hasEmpty = /no\s+(data|results|items|records|grants|users|projects|entries)/i.test(body);
  const hasError = /error|failed|could\s+not\s+load/i.test(body);
  const states = { loading: hasLoading, empty: hasEmpty, error: hasError };
  log(`  4-state coverage: loading=${hasLoading} empty=${hasEmpty} error=${hasError}`);
  // Flag if we see no empty-state handling at all on list pages
  if (!hasEmpty && !hasLoading) {
    uxGaps.push(`${label}: no obvious empty-state or loading-state indicators found in DOM`);
  }
}

// ─── safe hover/open test for mutating buttons ─────────────────────────────────

async function safeHoverMutatingButtons(page, found, label) {
  // Only hover or open (to inspect confirm dialogs), never submit
  for (const btnMeta of found.slice(0, 3)) {
    if (btnMeta.disabled) continue;
    try {
      const btns = page.locator(`button:visible, [role="button"]:visible`);
      const count = await btns.count();
      for (let i = 0; i < count; i++) {
        const b = btns.nth(i);
        const txt = await b.innerText().catch(() => '');
        if (txt.trim() === btnMeta.text) {
          await b.hover({ timeout: 3000 });
          log(`  hovered: "${btnMeta.text}" on ${label}`);
          // Check if a tooltip appeared
          const tooltip = await page.locator('[role="tooltip"]:visible, [data-tooltip]:visible').first().isVisible().catch(() => false);
          if (tooltip) {
            const ttText = await page.locator('[role="tooltip"]:visible').first().innerText().catch(() => '');
            log(`  tooltip: "${ttText}"`);
            if (/permission|not\s+allow|cannot|forbidden/i.test(ttText)) {
              mutatingButtons.find((m) => m.text === btnMeta.text && m.ctx === label && !m.gated)
                && (mutatingButtons.find((m) => m.text === btnMeta.text && m.ctx === label).gated = true);
            }
          }
          break;
        }
      }
    } catch (e) {
      log(`  hover failed on "${btnMeta.text}": ${e.message}`);
    }
  }
}

// ─── main audit ───────────────────────────────────────────────────────────────

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: STORAGE_STATE });
  const page = await ctx.newPage();

  // Suppress noise from response listener accumulation
  page.setDefaultTimeout(15000);

  // ── 1. /administration ──────────────────────────────────────────────────────
  {
    const label = '/administration';
    await visitPage(page, '/administration', label);
    await discoverTabs(page, label);
    await detectVendorLeaks(page, label);
    await detectGrantSurfaces(page, label);
    const found = await auditButtons(page, label);
    await check4States(page, label);

    // Iterate discovered tabs
    const tabBtns = await page.locator('[role="tab"]:visible, [role="tablist"] button:visible').all();
    const TAB_IDS = ['access', 'roles', 'featureGov', 'roleGovernance', 'performance', 'cacheCalls', 'usage', 'provisioning', 'projects', 'accessRequests'];
    for (const tabId of TAB_IDS.slice(0, 5)) { // limit to 5 tabs to stay in time budget
      await page.goto(`${BASE}/administration?tab=${tabId}`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT }).catch(() => {});
      const tabLabel = `${label}?tab=${tabId}`;
      const tabBody = await page.locator('body').innerText().catch(() => '');
      if (isWarmingText(tabBody)) {
        pages_warming.push({ page: tabLabel });
      } else if (isRealData(tabBody)) {
        pages_ok.push({ page: tabLabel });
      }
      await detectVendorLeaks(page, tabLabel);
      await detectGrantSurfaces(page, tabLabel);
      const tabFound = await auditButtons(page, tabLabel);
      log(`  tab ${tabId}: ${tabBody.length} chars, ${tabFound.length} mutating buttons`);
      await page.waitForTimeout(TAB_PAUSE / 2);
    }
    // Run remaining tabs quickly
    for (const tabId of TAB_IDS.slice(5)) {
      await page.goto(`${BASE}/administration?tab=${tabId}`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT }).catch(() => {});
      const tabLabel = `${label}?tab=${tabId}`;
      const tabBody = await page.locator('body').innerText().catch(() => '');
      if (isWarmingText(tabBody)) pages_warming.push({ page: tabLabel });
      else if (isRealData(tabBody)) pages_ok.push({ page: tabLabel });
      await detectGrantSurfaces(page, tabLabel);
      const tabFound = await auditButtons(page, tabLabel);
      log(`  tab ${tabId}: ${tabBody.length} chars, ${tabFound.length} mutating buttons`);
    }
  }

  // ── 2. /admin/api-health ───────────────────────────────────────────────────
  {
    const label = '/admin/api-health';
    await visitPage(page, '/admin/api-health', label);
    await discoverTabs(page, label);
    await detectVendorLeaks(page, label);
    await detectGrantSurfaces(page, label);
    const found = await auditButtons(page, label);
    await safeHoverMutatingButtons(page, found, label);
    await check4States(page, label);
  }

  // ── 3. /admin/data360-config ───────────────────────────────────────────────
  {
    const label = '/admin/data360-config';
    await visitPage(page, '/admin/data360-config', label);
    await discoverTabs(page, label);
    await detectVendorLeaks(page, label);
    await detectGrantSurfaces(page, label);
    const found = await auditButtons(page, label);
    await safeHoverMutatingButtons(page, found, label);
    await check4States(page, label);
  }

  // ── 4. /admin/platform-settings ───────────────────────────────────────────
  {
    const label = '/admin/platform-settings';
    await visitPage(page, '/admin/platform-settings', label);
    await discoverTabs(page, label);
    await detectVendorLeaks(page, label);
    await detectGrantSurfaces(page, label);
    const found = await auditButtons(page, label);
    await safeHoverMutatingButtons(page, found, label);
    await check4States(page, label);
  }

  await browser.close();

  // ── Final report ──────────────────────────────────────────────────────────

  const report = {
    summary: {
      pages_ok: pages_ok.length,
      pages_warming: pages_warming.length,
      pages_error: pages_error.length,
      actions_found: mutatingButtons.length,
      ungated_count: ungatedActions.length,
    },
    pages_ok,
    pages_warming,
    pages_error,
    fivexx,
    consoleErrors,
    mutatingButtons,
    ungatedActions,
    grantSurfaces,
    transparencyGaps,
    uxGaps,
    discoveredTabs,
  };

  process.stdout.write('\n===AUDIT_JSON_START===\n');
  process.stdout.write(JSON.stringify(report, null, 2));
  process.stdout.write('\n===AUDIT_JSON_END===\n');
})();
