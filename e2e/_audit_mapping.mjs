/**
 * READ-ONLY Playwright audit of the /mapping (+ /explore-design redirect target) module.
 * Runs against localhost:3000 with saved auth (HAHA / ACCOUNTADMIN).
 * Does NOT submit mutations — only opens modals/confirms, then cancels.
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_STATE = path.join(__dirname, '.auth/state.json');
const BASE = 'http://localhost:3000';

const findings = {
  pages: [],
  errors5xx: [],
  consoleErrors: [],
  actionButtons: [],
  permissionGated: [],
  ungated: [],
  approvalSurfaces: [],
  transparencyGaps: [],
  uxGaps: [],
  vendorLeaks: [],
};

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function auditPage(page, url, label) {
  const result = { url, label, status: 'ok', redirectedTo: null, isAuthed: true, hasRealData: false, warming: false, errors5xx: [], consoleErrors: [], buttons: [] };

  const responses = [];
  const consoleErrors = [];

  page.on('response', resp => {
    if (resp.status() >= 500) {
      responses.push({ url: resp.url(), status: resp.status() });
    }
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  // Check auth redirect
  const finalUrl = page.url();
  if (finalUrl.includes('/signin') || finalUrl.includes('/login') || finalUrl.includes('/auth')) {
    result.isAuthed = false;
    result.status = 'auth-redirect';
  } else {
    result.redirectedTo = finalUrl !== url ? finalUrl : null;
    result.isAuthed = true;
  }

  // Check for warming/loading states
  const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const warmingPhrases = ['warming up', 'cache is initializing', 'loading data', 'please wait', 'initializing'];
  result.warming = warmingPhrases.some(p => bodyText.toLowerCase().includes(p));
  result.hasRealData = !result.warming && bodyText.length > 200;

  result.errors5xx = responses;
  result.consoleErrors = consoleErrors;

  // Enumerate action buttons
  const buttons = await page.locator('button:visible').all();
  for (const btn of buttons.slice(0, 80)) {
    const text = (await btn.innerText().catch(() => '')).trim();
    const ariaLabel = await btn.getAttribute('aria-label').catch(() => '');
    const disabled = await btn.getAttribute('disabled').catch(() => null);
    const label2 = text || ariaLabel || '';
    if (!label2) continue;
    const isMutating = /create|add|new|edit|delete|remove|drop|deploy|apply|publish|run|save|grant|revoke|approve|deny|upload|import|export/i.test(label2);
    if (isMutating) {
      result.buttons.push({ text: label2, disabled: disabled !== null });
    }
  }

  findings.pages.push(result);
  findings.errors5xx.push(...responses);
  findings.consoleErrors.push(...consoleErrors.map(e => `[${label}] ${e}`));
  return result;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: AUTH_STATE });
  const page = await context.newPage();

  // ── 1. Audit /mapping (the redirect stub) ──────────────────────────────────
  console.log('Auditing /mapping ...');
  const mappingResult = await auditPage(page, `${BASE}/mapping`, '/mapping');
  console.log('  /mapping final URL:', page.url());
  console.log('  isAuthed:', mappingResult.isAuthed);
  console.log('  redirectedTo:', mappingResult.redirectedTo);

  // Wait for the redirect to fully settle
  await sleep(2000);

  // ── 2. Audit /explore-design (the real destination) ───────────────────────
  console.log('Auditing /explore-design ...');
  const edResult = await auditPage(page, `${BASE}/explore-design`, '/explore-design');
  console.log('  isAuthed:', edResult.isAuthed);
  console.log('  warming:', edResult.warming);
  console.log('  5xx count:', edResult.errors5xx.length);
  console.log('  console errors:', edResult.consoleErrors.length);
  await sleep(3000);

  // ── 3. Inspect the explore-design page for tabs ───────────────────────────
  console.log('Looking for tabs...');
  const tabButtons = await page.locator('[role="tab"]:visible, button[data-tab]:visible').all();
  const tabTexts = [];
  for (const t of tabButtons) {
    const txt = (await t.innerText().catch(() => '')).trim();
    if (txt) tabTexts.push(txt);
  }
  console.log('  Tabs found:', tabTexts);

  // Also look for tab-like nav links
  const navLinks = await page.locator('nav a:visible, [role="tablist"] *:visible').allInnerTexts().catch(() => []);
  console.log('  Nav/tablist texts:', navLinks.slice(0, 20));

  // ── 4. Check for action buttons on explore-design ─────────────────────────
  const allButtons = await page.locator('button:visible').all();
  const actionButtons = [];
  for (const btn of allButtons.slice(0, 100)) {
    const text = (await btn.innerText().catch(() => '')).trim();
    const ariaLabel = await btn.getAttribute('aria-label').catch(() => '');
    const disabled = await btn.getAttribute('disabled').catch(() => null);
    const title = await btn.getAttribute('title').catch(() => '');
    const btnLabel = text || ariaLabel || title || '';
    if (!btnLabel) continue;
    const isMutating = /create|add|new|edit|delete|remove|drop|deploy|apply|publish|run|save|grant|revoke|approve|deny|upload|import|refresh|export/i.test(btnLabel);
    if (isMutating) {
      actionButtons.push({ text: btnLabel, disabled: disabled !== null, title });
    }
  }
  console.log('  Action buttons found:', actionButtons.map(b => b.text));
  findings.actionButtons = actionButtons;

  // ── 5. Try to open (then cancel) a key modal ──────────────────────────────
  // Look for "Create" / "New" / "Add" buttons that open dialogs
  const createBtn = await page.locator('button:visible').filter({ hasText: /create|new project|add table/i }).first();
  let createBtnExists = false;
  try {
    await createBtn.waitFor({ timeout: 3000 });
    createBtnExists = true;
  } catch {}

  if (createBtnExists) {
    console.log('  Opening create button...');
    await createBtn.click().catch(() => {});
    await sleep(1500);
    const dialogVisible = await page.locator('[role="dialog"]:visible, .modal:visible').count();
    console.log('  Dialog appeared:', dialogVisible > 0);
    if (dialogVisible > 0) {
      // Check if there's a permission gate visible inside
      const permGateText = await page.locator('[role="dialog"]:visible').innerText().catch(() => '');
      const hasPermGate = /permission|not allowed|access denied|unauthorized/i.test(permGateText);
      console.log('  Dialog has permission gate:', hasPermGate);
      // Cancel
      await page.locator('[role="dialog"]:visible button').filter({ hasText: /cancel|close|dismiss/i }).first().click().catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
      await sleep(500);
    }
  }

  // ── 6. Check for vendor name leaks in visible text ────────────────────────
  console.log('Checking for vendor name leaks...');
  const pageBody = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const vendorMatches = [];
  if (/snowflake/i.test(pageBody)) vendorMatches.push('Snowflake found in page body text');
  if (/cortex/i.test(pageBody)) vendorMatches.push('Cortex found in page body text');
  if (/kimi/i.test(pageBody)) vendorMatches.push('Kimi found in page body text');
  console.log('  Vendor leaks:', vendorMatches);
  findings.vendorLeaks = vendorMatches;

  // ── 7. Check for ?tab= sub-tabs on explore-design ─────────────────────────
  // Look for tab button labels visible on page and try navigating to them
  const visibleTabBtns = await page.locator('[role="tab"]:visible').all();
  const tabsAudited = [];
  for (const tabBtn of visibleTabBtns.slice(0, 5)) {
    const tabText = (await tabBtn.innerText().catch(() => '')).trim();
    if (!tabText) continue;
    console.log(`  Clicking tab: ${tabText}`);
    await tabBtn.click().catch(() => {});
    await sleep(1500);
    const tabErrors5xx = [];
    page.on('response', r => { if (r.status() >= 500) tabErrors5xx.push(r.url()); });
    const tabBodyText = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
    const tabWarming = ['warming', 'initializing', 'cache'].some(p => tabBodyText.toLowerCase().includes(p));
    tabsAudited.push({ tab: tabText, warming: tabWarming, errors5xx: tabErrors5xx });
  }
  console.log('  Tabs audited:', tabsAudited);

  // ── 8. Check for permission-gated vs ungated buttons ─────────────────────
  // Inspect the PermissionGate wrappers visibility in DOM
  const permGateCount = await page.locator('[data-permission-gate], [class*="permission"]').count();
  console.log('  PermissionGate elements in DOM:', permGateCount);

  // Check if any disabled buttons have tooltips explaining why
  const disabledBtns = await page.locator('button[disabled]:visible, button[aria-disabled="true"]:visible').all();
  const disabledWithTooltip = [];
  for (const btn of disabledBtns.slice(0, 10)) {
    const text = (await btn.innerText().catch(() => '')).trim();
    const title = await btn.getAttribute('title').catch(() => '');
    if (text || title) disabledWithTooltip.push({ text, title });
  }
  console.log('  Disabled buttons with tooltip:', disabledWithTooltip);

  // ── 9. Check /explore-design with ?tab= variants ─────────────────────────
  const knownTabs = ['canvas', 'catalog', 'events', 'governance', 'deployment', 'data-engineering'];
  const tabResults = [];
  for (const tab of knownTabs) {
    const tabUrl = `${BASE}/explore-design?tab=${tab}`;
    console.log(`  Testing tab URL: ${tabUrl}`);
    const tabErrors = [];
    const tabConsoleErrors = [];
    const respHandler = r => { if (r.status() >= 500) tabErrors.push({ url: r.url(), status: r.status() }); };
    const consoleHandler = m => { if (m.type() === 'error') tabConsoleErrors.push(m.text()); };
    page.on('response', respHandler);
    page.on('console', consoleHandler);
    await page.goto(tabUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await sleep(2000);
    page.off('response', respHandler);
    page.off('console', consoleHandler);
    const tabBody = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
    const warm = ['warming', 'initializing'].some(p => tabBody.toLowerCase().includes(p));
    tabResults.push({ tab, errors5xx: tabErrors, consoleErrors: tabConsoleErrors, warming: warm, url: page.url() });
    findings.errors5xx.push(...tabErrors);
    findings.consoleErrors.push(...tabConsoleErrors.map(e => `[${tab} tab] ${e}`));
  }

  // ── Output summary ────────────────────────────────────────────────────────
  console.log('\n========== AUDIT SUMMARY ==========');
  console.log('Pages visited:', findings.pages.map(p => `${p.label} → ${p.status} (authed=${p.isAuthed}, warming=${p.warming})`));
  console.log('Tab results:', JSON.stringify(tabResults, null, 2));
  console.log('Action buttons:', findings.actionButtons.map(b => `${b.text} (disabled=${b.disabled})`));
  console.log('5xx errors:', findings.errors5xx);
  console.log('Console errors (first 10):', findings.consoleErrors.slice(0, 10));
  console.log('Vendor leaks:', findings.vendorLeaks);
  console.log('Tabs discovered:', tabTexts);

  // Write structured output for the parent agent
  const output = {
    pages: findings.pages.map(p => ({ url: p.url, label: p.label, status: p.status, isAuthed: p.isAuthed, redirectedTo: p.redirectedTo, warming: p.warming, hasRealData: p.hasRealData })),
    tabResults,
    actionButtons: findings.actionButtons,
    errors5xx: findings.errors5xx,
    consoleErrors: findings.consoleErrors.slice(0, 20),
    vendorLeaks: findings.vendorLeaks,
    tabsOnPage: tabTexts,
    disabledWithTooltip,
    tabsAudited,
  };
  console.log('\nJSON_OUTPUT:', JSON.stringify(output));

  await browser.close();
})();
