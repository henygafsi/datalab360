// Audit the /admin/data360-config console in a real browser:
// login → open each tab → capture API network (status + body snippet),
// console errors, screenshots, and detected empty-states. Prints a report.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:3000';
const USER = process.env.DATA360_E2E_USER || 'HAHA';
const PASS = process.env.DATA360_E2E_PASSWORD || '';
const ACCOUNT_CANDIDATES = (process.env.DATA360_E2E_ACCOUNT_CANDIDATES || process.env.DATA360_E2E_ACCOUNT || 'HAHA')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
const OUT = 'e2e/admin-audit';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 }, storageState: 'e2e/.auth/state.json' });
const page = await ctx.newPage();

// ── collect API traffic + console errors globally, tagged by current tab ──
let currentTab = 'login';
const api = [];
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push({ tab: currentTab, text: m.text().slice(0, 300) });
});
page.on('response', async (res) => {
  const url = res.url();
  if (!/\/api-proxy\/|api\.datalab360\.io|\/api\//.test(url)) return;
  if (/\.(js|css|png|svg|woff)/.test(url) || /\/api\/auth\//.test(url)) return;
  let snippet = '';
  try {
    const ct = res.headers()['content-type'] || '';
    if (ct.includes('json')) snippet = JSON.stringify(await res.json()).slice(0, 260);
  } catch {
    /* ignore */
  }
  api.push({ tab: currentTab, status: res.status(), url: url.replace('https://api.datalab360.io', ''), snippet });
});

// ── authenticated via saved storageState (e2e/.auth/state.json) ──
void USER;
void PASS;
void ACCOUNT_CANDIDATES;

// ── open the admin console ──
currentTab = 'load';
await page.goto(`${BASE}/admin/data360-config`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3500);
await page.screenshot({ path: `${OUT}/00-load.png`, fullPage: true });

const TABS = ['Overview', 'Performance', 'Events', 'Cache', 'Access'];
const tabReport = {};
for (let i = 0; i < TABS.length; i++) {
  const tab = TABS[i];
  currentTab = tab;
  const apiBefore = api.length;
  try {
    const btn = page.getByRole('button', { name: new RegExp(tab, 'i') }).first();
    await btn.click({ timeout: 5000 });
  } catch {
    console.log(`TAB_CLICK_FAIL ${tab}`);
  }
  await page.waitForTimeout(2800);
  await page.screenshot({ path: `${OUT}/0${i + 1}-${tab.toLowerCase()}.png`, fullPage: true });

  // crude content signals
  const bodyText = await page.locator('main, body').first().innerText().catch(() => '');
  const emptyHits = (bodyText.match(/No |—|not available|No data|empty|No recent|No cached|No slow|No request/gi) || []).length;
  const tableRows = await page.locator('table tbody tr').count().catch(() => 0);
  const cards = await page.locator('[class*="glass"]').count().catch(() => 0);
  tabReport[tab] = {
    apiCalls: api.slice(apiBefore).map((a) => `${a.status} ${a.url}`),
    emptyStateHits: emptyHits,
    tableRows,
    glassPanels: cards,
  };
}

writeFileSync(`${OUT}/report.json`, JSON.stringify({ tabReport, api, consoleErrors }, null, 2));

// ── console summary ──
console.log('\n===== TAB REPORT =====');
for (const tab of TABS) {
  const r = tabReport[tab];
  console.log(`\n## ${tab}  (rows=${r.tableRows}, emptyHits=${r.emptyStateHits})`);
  for (const c of r.apiCalls) console.log('   ', c);
}
console.log('\n===== NON-200 API =====');
for (const a of api) if (a.status !== 200) console.log(`  ${a.status} [${a.tab}] ${a.url}  ${a.snippet.slice(0, 120)}`);
console.log('\n===== CONSOLE ERRORS =====');
for (const c of consoleErrors.slice(0, 20)) console.log(`  [${c.tab}] ${c.text}`);

await browser.close();
console.log('\nDONE → e2e/admin-audit/report.json + shots');
