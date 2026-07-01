/**
 * _audit_sources.mjs
 * READ-ONLY Playwright audit: /sources and /data-source-connection
 * Run: node e2e/_audit_sources.mjs (from repo root)
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_STATE = join(__dirname, '.auth/state.json');
const BASE = 'http://localhost:3000';
const TIMEOUT = 15000;

const results = {
  pages: [],
  errors5xx: [],
  consoleErrors: [],
  actions: [],
  permGated: [],
  ungated: [],
  approvalSurfaces: [],
  transparencyGaps: [],
  uxGaps: [],
};

async function auditPage(browser, url, label) {
  const page = await browser.newPage();
  const pageResult = { url, label, status: 'ok', note: '', dataState: 'unknown', tabs: [], networkErrors: [] };
  const consoleErrs = [];
  const netErrs = [];

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrs.push(msg.text());
  });
  page.on('pageerror', err => consoleErrs.push(`PAGE_ERROR: ${err.message}`));

  // Capture 5xx + 4xx relevant responses
  page.on('response', async resp => {
    const status = resp.status();
    const u = resp.url();
    if (status >= 500) {
      netErrs.push(`${status} ${u}`);
    }
    // Also track 403/401 on API routes as they indicate permission issues
    if ((status === 403 || status === 401) && u.includes('/api')) {
      netErrs.push(`${status} ${u}`);
    }
  });

  try {
    await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 30000 });

    // Check redirect
    const finalUrl = page.url();
    if (finalUrl.includes('/signin') || finalUrl.includes('/login')) {
      pageResult.status = 'redirect-to-signin';
      pageResult.note = `Redirected to ${finalUrl}`;
      return pageResult;
    }

    // Wait for content to settle
    await page.waitForTimeout(2000);

    // Check warming/loading state
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (
      /warming up|cache is initializing|initializing cache|loading data/i.test(bodyText)
    ) {
      pageResult.dataState = 'warming';
    } else if (
      /no data|empty|no records|no results/i.test(bodyText) &&
      !/table|database|schema/i.test(bodyText)
    ) {
      pageResult.dataState = 'empty-possibly';
    } else {
      pageResult.dataState = 'data-visible';
    }

    // Capture tab buttons
    const tabButtons = await page.$$eval(
      'button[role="tab"], [class*="tab"] button, button[class*="tab"]',
      els => els.map(el => el.textContent?.trim()).filter(Boolean)
    );
    pageResult.tabs = [...new Set(tabButtons)];

    // Also check for in-page tab buttons (the Sources page uses custom button tabs)
    const inPageTabs = await page.$$eval(
      'button',
      els => els
        .filter(el => {
          const classes = el.className || '';
          return classes.includes('border-b-2') || classes.includes('tab');
        })
        .map(el => el.textContent?.trim())
        .filter(Boolean)
    );
    pageResult.tabs = [...new Set([...pageResult.tabs, ...inPageTabs])];

    // Collect all visible buttons
    const buttons = await page.$$eval('button:not([disabled]):not([aria-hidden="true"]), a[href][role="button"]', els =>
      els.map(el => ({
        text: el.textContent?.trim().replace(/\s+/g, ' ').substring(0, 80),
        disabled: el.hasAttribute('disabled'),
        title: el.getAttribute('title') || el.getAttribute('aria-label') || '',
        href: el.getAttribute('href') || '',
      })).filter(b => b.text && b.text.length > 0)
    );

    pageResult.buttons = buttons;

    // Classify mutating actions
    const MUTATING_KEYWORDS = /add|create|connect|save|submit|delete|remove|revoke|grant|approve|deny|apply|publish|run|deploy|refresh|ingest|upload|reset|confirm|disconnect/i;
    const mutating = buttons.filter(b => MUTATING_KEYWORDS.test(b.text));
    pageResult.mutatingButtons = mutating;

    // Check for disabled-with-title (permission gated)
    const allButtonsIncDisabled = await page.$$eval('button, a[href][role="button"]', els =>
      els.map(el => ({
        text: el.textContent?.trim().replace(/\s+/g, ' ').substring(0, 80),
        disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
        title: el.getAttribute('title') || el.getAttribute('aria-label') || '',
      })).filter(b => b.text && b.text.length > 0)
    );
    const disabledWithReason = allButtonsIncDisabled.filter(b => b.disabled && b.title && b.title.toLowerCase().includes('permission'));
    pageResult.permGatedButtons = disabledWithReason;

    // Hover over first safe mutating button (non-destructive: Create, Add, Refresh)
    const safeToHover = ['Refresh Catalog', 'Add Source', 'AI Helper', 'Add Connection', 'Refresh', 'AI'];
    for (const name of safeToHover) {
      const btn = page.locator(`button:has-text("${name}")`).first();
      if (await btn.count() > 0) {
        try {
          await btn.hover({ timeout: 2000 });
          await page.waitForTimeout(500);
          pageResult.note += ` [hovered:${name}]`;
        } catch {}
      }
    }

    // Try clicking "Add Source" button safely (it's a link to another page)
    // Don't actually navigate

    // Check for approval/grant UI patterns
    const grantTexts = await page.$$eval('button, [role="menuitem"], a', els =>
      els
        .filter(el => /grant|revoke|approve|deny|allow|access control|permission/i.test(el.textContent || ''))
        .map(el => el.textContent?.trim().substring(0, 60))
        .filter(Boolean)
    );
    pageResult.approvalControls = [...new Set(grantTexts)];

    // Check for vendor name leaks in rendered text
    const vendorLeaks = [];
    if (/snowflake/i.test(bodyText)) {
      // Count only clearly user-facing mentions (not just alt text or technical labels)
      const snowflakeCount = (bodyText.match(/snowflake/gi) || []).length;
      vendorLeaks.push(`"Snowflake" appears ${snowflakeCount}x in rendered text`);
    }
    if (/cortex/i.test(bodyText)) vendorLeaks.push('"Cortex" in rendered text');
    if (/kimi/i.test(bodyText)) vendorLeaks.push('"Kimi" in rendered text');
    pageResult.vendorLeaks = vendorLeaks;

    // Check for 4-state coverage: loading skeleton, empty state, error state, data state
    const hasLoadingSkeleton = await page.$('[class*="skeleton"], [class*="animate-pulse"], [class*="shimmer"]') !== null;
    const hasErrorState = await page.$('[role="alert"], [class*="error"], [class*="Error"]') !== null;
    pageResult.fourStateCheck = {
      hasLoadingSkeleton,
      hasErrorState,
      dataVisible: pageResult.dataState === 'data-visible',
    };

  } catch (err) {
    pageResult.status = 'error';
    pageResult.note = err.message;
  }

  pageResult.networkErrors = netErrs;
  pageResult.consoleErrors = consoleErrs.slice(0, 10);
  await page.close();
  return pageResult;
}

async function auditDataSourceConnection(browser) {
  const page = await browser.newPage();
  const result = { url: '/data-source-connection', label: 'Data Source Connection', status: 'ok', sections: [] };
  const consoleErrs = [];
  const netErrs = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrs.push(msg.text());
  });
  page.on('pageerror', err => consoleErrs.push(`PAGE_ERROR: ${err.message}`));
  page.on('response', async resp => {
    const status = resp.status();
    const u = resp.url();
    if (status >= 500) netErrs.push(`${status} ${u}`);
    if ((status === 403 || status === 401) && u.includes('/api')) netErrs.push(`${status} ${u}`);
  });

  try {
    await page.goto(`${BASE}/data-source-connection`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const finalUrl = page.url();
    if (finalUrl.includes('/signin')) {
      result.status = 'redirect-to-signin';
      await page.close();
      return result;
    }

    const bodyText = await page.evaluate(() => document.body.innerText);
    result.dataState = /warming up|cache is initializing/i.test(bodyText) ? 'warming' : 'data-visible';

    // Check existing connections section (Active Connections)
    const connectionCards = await page.$$eval('[class*="connection"], [class*="stage"], [class*="Connection"]', els =>
      els.slice(0, 5).map(el => el.textContent?.trim().substring(0, 100))
    );
    result.connectionCards = connectionCards;

    // Get all buttons
    const allButtons = await page.$$eval('button', els =>
      els.map(el => ({
        text: el.textContent?.trim().replace(/\s+/g, ' ').substring(0, 80),
        disabled: el.hasAttribute('disabled'),
        title: el.getAttribute('title') || '',
      })).filter(b => b.text && b.text.length > 0)
    );
    result.allButtons = allButtons;

    // Source cards (connector types)
    const sourceCards = await page.$$eval('[class*="rounded-2xl"], [class*="card"]', els =>
      els.slice(0, 20).map(el => {
        const h3 = el.querySelector('h3, h2');
        return h3?.textContent?.trim();
      }).filter(Boolean)
    );
    result.sourceCards = [...new Set(sourceCards)];

    // Try clicking a safe connector: Oracle (first, to see the form without submitting)
    // Just check if it opens a form, then cancel
    const oracleCard = page.locator('text=Oracle ATP').first();
    if (await oracleCard.count() > 0) {
      try {
        await oracleCard.click({ timeout: 3000 });
        await page.waitForTimeout(1000);
        result.oracleFormOpened = true;

        // Check if pre-filled values are visible
        const oracleFields = await page.$$eval('input[type="text"], input[type="password"], input[type="number"]', els =>
          els.map(el => ({
            name: el.getAttribute('name') || el.id || el.getAttribute('placeholder') || '',
            value: el.value,
          }))
        );
        result.oracleFields = oracleFields.filter(f => f.value);

        // Go back
        const backBtn = page.locator('button:has-text("Back"), button:has-text("back")').first();
        if (await backBtn.count() > 0) {
          await backBtn.click({ timeout: 2000 });
        }
      } catch (e) {
        result.oracleFormOpened = false;
      }
    }

    // Check SourceHub section
    const hubSection = await page.$('[class*="SourceHub"], [class*="source-hub"]');
    result.hasSourceHub = hubSection !== null;

    // Check AI Helper button
    const aiHelperBtn = page.locator('button:has-text("AI"), button:has-text("Helper"), button[title*="AI"]').first();
    result.hasAiHelper = await aiHelperBtn.count() > 0;

    // Check ConnectorHealthStrip
    const healthStrip = await page.$('[class*="health"], [class*="Health"]');
    result.hasHealthStrip = healthStrip !== null;

    // Vendor name leaks check
    const vendorLeaks = [];
    if (/snowflake/i.test(bodyText)) {
      const count = (bodyText.match(/snowflake/gi) || []).length;
      vendorLeaks.push(`"Snowflake" x${count} in rendered text`);
    }
    if (/cortex/i.test(bodyText)) vendorLeaks.push('"Cortex" visible');
    if (/kimi/i.test(bodyText)) vendorLeaks.push('"Kimi" visible');

    // Check for Oracle connection details (pre-filled host) in DOM
    const inputValues = await page.$$eval('input', els =>
      els.map(el => el.value).filter(Boolean)
    );
    if (inputValues.some(v => v.includes('adb.eu-paris-1.oraclecloud.com') || v.includes('g9bbeb1dc290c07'))) {
      vendorLeaks.push('Oracle ATP cloud hostname pre-filled in form (instance identifier leaks)');
    }
    result.vendorLeaks = vendorLeaks;

    // Snowflake connection form — check it renders without requiring extra click
    const snowflakeSection = bodyText.includes('Snowflake Connection') || bodyText.includes('Snowflake');
    result.snowflakeVisible = snowflakeSection;

    result.networkErrors = netErrs;
    result.consoleErrors = consoleErrs.slice(0, 10);

  } catch (err) {
    result.status = 'error';
    result.note = err.message;
    result.networkErrors = netErrs;
    result.consoleErrors = consoleErrs.slice(0, 5);
  }

  await page.close();
  return result;
}

async function auditSourcesDetectedModels(browser) {
  // Navigate to /sources?tab=models equivalent — the page uses local state, so
  // we click the "Detected Models" tab after load
  const page = await browser.newPage();
  const result = { label: 'Sources: Detected Models tab', status: 'ok', note: '' };
  const netErrs = [];
  const consoleErrs = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrs.push(msg.text());
  });
  page.on('response', resp => {
    if (resp.status() >= 500) netErrs.push(`${resp.status()} ${resp.url()}`);
  });

  try {
    await page.goto(`${BASE}/sources`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Click the Detected Models tab
    const modelsTab = page.locator('button:has-text("Detected Models")').first();
    if (await modelsTab.count() > 0) {
      await modelsTab.click({ timeout: 3000 });
      await page.waitForTimeout(2000);
      result.tabClicked = true;
    }

    const bodyText = await page.evaluate(() => document.body.innerText);
    result.dataState = /warming|initializing/i.test(bodyText) ? 'warming' : 'data-visible';
    result.hasNoProjectMessage = /no project selected|select a project/i.test(bodyText);
    result.note = result.hasNoProjectMessage
      ? 'Detected Models tab shows "No Project Selected" empty state — correct behavior when no project chosen'
      : 'Detected Models tab shows data';

    // Check if AI action is gated
    const runBtn = page.locator('button:has-text("Run"), button:has-text("Detect"), button:has-text("Generate")').first();
    result.hasDetectButton = await runBtn.count() > 0;

    result.networkErrors = netErrs;
    result.consoleErrors = consoleErrs.slice(0, 5);
  } catch (err) {
    result.status = 'error';
    result.note = err.message;
  }
  await page.close();
  return result;
}

(async () => {
  console.log('Launching Playwright audit (sources module)…');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: AUTH_STATE,
    viewport: { width: 1440, height: 900 },
  });

  // Audit /sources main page
  console.log('[1/4] Auditing /sources …');
  const sourcesResult = await auditPage(context, '/sources', 'Sources: Sources tab');

  // Audit /sources Detected Models tab
  console.log('[2/4] Auditing /sources → Detected Models tab …');
  const modelsResult = await auditSourcesDetectedModels(context);

  // Audit /data-source-connection
  console.log('[3/4] Auditing /data-source-connection …');
  const dscResult = await auditDataSourceConnection(context);

  // Final summary
  console.log('\n========== AUDIT RESULTS ==========\n');

  console.log('## /sources (Sources tab)');
  console.log('  Auth status:', sourcesResult.status);
  console.log('  Data state:', sourcesResult.dataState);
  console.log('  Tabs found:', (sourcesResult.tabs || []).join(', ') || 'none');
  console.log('  Mutating buttons:', (sourcesResult.mutatingButtons || []).map(b => b.text).join(' | '));
  console.log('  Perm-gated (disabled+reason):', (sourcesResult.permGatedButtons || []).map(b => `${b.text} [${b.title}]`).join(' | ') || 'none');
  console.log('  Approval controls:', (sourcesResult.approvalControls || []).join(' | ') || 'none');
  console.log('  Vendor leaks:', (sourcesResult.vendorLeaks || []).join('; ') || 'none');
  console.log('  4-state check:', JSON.stringify(sourcesResult.fourStateCheck));
  console.log('  Network errors (5xx/auth):', (sourcesResult.networkErrors || []).join(', ') || 'none');
  console.log('  Console errors:', (sourcesResult.consoleErrors || []).slice(0, 5).join('\n    ') || 'none');

  console.log('\n## /sources → Detected Models');
  console.log('  Status:', modelsResult.status);
  console.log('  Data state:', modelsResult.dataState);
  console.log('  Has no-project message:', modelsResult.hasNoProjectMessage);
  console.log('  Note:', modelsResult.note);
  console.log('  Network errors:', (modelsResult.networkErrors || []).join(', ') || 'none');
  console.log('  Console errors:', (modelsResult.consoleErrors || []).join(', ') || 'none');

  console.log('\n## /data-source-connection');
  console.log('  Auth status:', dscResult.status);
  console.log('  Data state:', dscResult.dataState);
  console.log('  Source cards:', (dscResult.sourceCards || []).join(' | ') || 'none');
  console.log('  Connection cards:', (dscResult.connectionCards || []).slice(0, 3).join(' | ') || 'none');
  console.log('  Oracle form opened:', dscResult.oracleFormOpened);
  console.log('  Oracle fields with values:', JSON.stringify(dscResult.oracleFields || []));
  console.log('  Has SourceHub:', dscResult.hasSourceHub);
  console.log('  Has AI Helper:', dscResult.hasAiHelper);
  console.log('  Vendor leaks:', (dscResult.vendorLeaks || []).join('; ') || 'none');
  console.log('  Snowflake name visible:', dscResult.snowflakeVisible);
  console.log('  All buttons:', (dscResult.allButtons || []).map(b => b.text).join(' | ').substring(0, 500));
  console.log('  Disabled+reason buttons:', (dscResult.allButtons || []).filter(b => b.disabled && b.title).map(b => `${b.text}[${b.title}]`).join(' | ') || 'none');
  console.log('  Network errors (5xx):', (dscResult.networkErrors || []).join(', ') || 'none');
  console.log('  Console errors:', (dscResult.consoleErrors || []).slice(0, 5).join('\n    ') || 'none');

  await context.close();
  await browser.close();

  console.log('\n[Done]');
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
