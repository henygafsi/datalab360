/**
 * E2E audit: account-ai domain
 * Tests account-overview (9 tabs) + intelligent (12 AI tabs)
 * Captures API responses and classifies done/not_done per tab.
 */
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname2, '..');

const SCREENS_DIR = path.join(REPO_ROOT, 'docs/product-readiness-audit/screens/overnight/account-ai');
const BASE_URL = 'http://localhost:3000';
const AUTH_STATE = path.join(REPO_ROOT, 'e2e/.auth/state.json');

fs.mkdirSync(SCREENS_DIR, { recursive: true });

let screenshotIdx = 0;
async function shot(page, label) {
  screenshotIdx++;
  const fname = `${String(screenshotIdx).padStart(2, '0')}_${label}.png`;
  const p = path.join(SCREENS_DIR, fname);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`  shot: ${fname}`);
  return p;
}

// Classify a set of api responses for a tab
function classifyResponses(responses) {
  const issues = [];
  let hasRealData = false;
  let hasError = false;

  for (const r of responses) {
    if (r.status >= 400) {
      hasError = true;
      issues.push(`${r.status} ${r.url}`);
    } else if (r.status === 200) {
      // Check if body is empty/null
      try {
        const body = r.body;
        if (body === null || body === undefined) {
          issues.push(`200 but null body: ${r.url}`);
        } else if (Array.isArray(body) && body.length === 0) {
          issues.push(`200 empty array: ${r.url}`);
        } else if (typeof body === 'object' && Object.keys(body).length === 0) {
          issues.push(`200 empty object: ${r.url}`);
        } else {
          hasRealData = true;
        }
      } catch {
        hasRealData = true; // non-JSON is fine (streaming etc.)
      }
    }
  }

  return { hasRealData, hasError, issues };
}

async function testTab(page, url, tabLabel, apiLog, waitMs = 4000) {
  console.log(`\n  -> ${tabLabel}: ${url}`);
  const tabResponses = [];

  // Capture API responses for this tab
  const listener = async (response) => {
    const u = response.url();
    if (u.includes('/api-proxy/') || u.includes('/api/')) {
      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      tabResponses.push({ url: u, status: response.status(), body });
    }
  };
  page.on('response', listener);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    // Wait for data to settle
    await page.waitForTimeout(waitMs);
  } catch (e) {
    console.log(`    ERROR navigating: ${e.message}`);
  }

  page.off('response', listener);
  apiLog[tabLabel] = tabResponses;
  return tabResponses;
}

const results = {
  done: [],
  not_done: [],
  defects: [],
  screens: [],
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: AUTH_STATE,
    viewport: { width: 1600, height: 1000 },
  });
  const page = await ctx.newPage();

  // Suppress console noise
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`  [console.error] ${msg.text().slice(0, 120)}`);
    }
  });

  const apiLog = {};

  // ─────────────────────────────────────────────────────────────
  // PART 1: account-overview tabs
  // ─────────────────────────────────────────────────────────────
  const AO_TABS = [
    { id: 'overview',           label: 'Overview' },
    { id: 'dwh-plan',           label: 'DWH Action Plan' },
    { id: 'snowflake-objects',  label: 'Data Objects' },
    { id: 'finops',             label: 'FinOps' },
    { id: 'modules',            label: 'Modules' },
    { id: 'platform-activity',  label: 'Platform Activity' },
    { id: 'projects',           label: 'Projects' },
    { id: 'security',           label: 'Security' },
    { id: 'organization',       label: 'Organization' },
  ];

  console.log('\n=== ACCOUNT-OVERVIEW TABS ===');
  for (const tab of AO_TABS) {
    const url = `${BASE_URL}/account-overview?tab=${tab.id}`;
    const fullLabel = `account-overview/${tab.label}`;
    await testTab(page, url, fullLabel, apiLog, 5000);
    const imgPath = await shot(page, `ao_${tab.id}`);
    results.screens.push(imgPath);

    const tabResps = apiLog[fullLabel] || [];
    const { hasRealData, hasError, issues } = classifyResponses(tabResps);
    const apiCount = tabResps.length;
    const successCount = tabResps.filter(r => r.status === 200).length;
    const errorCount = tabResps.filter(r => r.status >= 400).length;

    console.log(`    APIs: total=${apiCount} ok=${successCount} err=${errorCount}`);
    if (issues.length) console.log(`    Issues: ${issues.slice(0,5).join('; ')}`);

    if (hasError && !hasRealData) {
      results.not_done.push(`account-overview/${tab.label}: all API calls failed (${errorCount} errors)`);
      for (const iss of issues.slice(0, 3)) {
        results.defects.push(`account-overview/${tab.label}: ${iss}`);
      }
    } else if (!hasRealData && apiCount === 0) {
      results.not_done.push(`account-overview/${tab.label}: no API calls fired — tab may be static placeholder`);
    } else if (hasRealData && !hasError) {
      results.done.push(`account-overview/${tab.label}: ${successCount} API calls returned real data`);
    } else if (hasRealData && hasError) {
      // Partial
      results.done.push(`account-overview/${tab.label}: partial (${successCount} ok / ${errorCount} err)`);
      for (const iss of issues.slice(0, 3)) {
        results.defects.push(`account-overview/${tab.label}: ${iss}`);
      }
    } else {
      // 200 but all empty bodies
      results.not_done.push(`account-overview/${tab.label}: 200 responses but all empty payloads`);
      for (const iss of issues.slice(0, 3)) {
        results.defects.push(`account-overview/${tab.label}: ${iss}`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PART 2: intelligent tabs
  // ─────────────────────────────────────────────────────────────
  const INT_TABS = [
    { id: 'semantic-models',   label: 'Semantic Models' },
    { id: 'ai-console',        label: 'AI Console' },
    { id: 'cortex-chat',       label: 'AI Chat' },
    { id: 'ai-advisor',        label: 'AI Advisor' },
    { id: 'ml-features',       label: 'ML Features' },
    { id: 'advanced-ml',       label: 'Advanced ML' },
    { id: 'query-analytics',   label: 'Query Analytics' },
    { id: 'local-analytics',   label: 'Local Analytics' },
    { id: 'snowpark-services',  label: 'Container Apps' },
    { id: 'cortex-agents',     label: 'AI Agents' },
    { id: 'semantic-views',    label: 'Semantic Views' },
    { id: 'vector-search',     label: 'Vector Search' },
  ];

  console.log('\n=== INTELLIGENT (AI) TABS ===');
  for (const tab of INT_TABS) {
    const url = `${BASE_URL}/intelligent?tab=${tab.id}`;
    const fullLabel = `intelligent/${tab.label}`;
    await testTab(page, url, fullLabel, apiLog, 5000);
    const imgPath = await shot(page, `int_${tab.id}`);
    results.screens.push(imgPath);

    const tabResps = apiLog[fullLabel] || [];
    const { hasRealData, hasError, issues } = classifyResponses(tabResps);
    const apiCount = tabResps.length;
    const successCount = tabResps.filter(r => r.status === 200).length;
    const errorCount = tabResps.filter(r => r.status >= 400).length;

    console.log(`    APIs: total=${apiCount} ok=${successCount} err=${errorCount}`);
    if (issues.length) console.log(`    Issues: ${issues.slice(0,5).join('; ')}`);

    if (hasError && !hasRealData) {
      results.not_done.push(`intelligent/${tab.label}: all API calls failed (${errorCount} errors)`);
      for (const iss of issues.slice(0, 3)) {
        results.defects.push(`intelligent/${tab.label}: ${iss}`);
      }
    } else if (!hasRealData && apiCount === 0) {
      results.not_done.push(`intelligent/${tab.label}: no API calls fired — static/UI-only`);
    } else if (hasRealData && !hasError) {
      results.done.push(`intelligent/${tab.label}: ${successCount} API calls returned real data`);
    } else if (hasRealData && hasError) {
      results.done.push(`intelligent/${tab.label}: partial (${successCount} ok / ${errorCount} err)`);
      for (const iss of issues.slice(0, 3)) {
        results.defects.push(`intelligent/${tab.label}: ${iss}`);
      }
    } else {
      results.not_done.push(`intelligent/${tab.label}: 200 responses but all empty payloads`);
      for (const iss of issues.slice(0, 3)) {
        results.defects.push(`intelligent/${tab.label}: ${iss}`);
      }
    }
  }

  await browser.close();

  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────
  console.log('\n=== SUMMARY ===');
  console.log('\nDONE:');
  results.done.forEach(d => console.log(`  + ${d}`));
  console.log('\nNOT DONE:');
  results.not_done.forEach(d => console.log(`  - ${d}`));
  console.log('\nDEFECTS:');
  results.defects.forEach(d => console.log(`  ! ${d}`));
  console.log('\nScreenshots saved to:', SCREENS_DIR);

  // Write results JSON for the StructuredOutput
  const outPath = path.join(REPO_ROOT, 'docs/product-readiness-audit/screens/overnight/account-ai/_results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Results JSON: ${outPath}`);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
