import { test, Page } from '@playwright/test';

const BASE = process.env.BASE_URL || 'https://data36.vercel.app';
const ACCOUNT = process.env.TEST_ACCOUNT || 'ESPRIT';
const USER = process.env.TEST_USER || 'aymen';
const PASS = process.env.TEST_PASS || 'Aymenzouari58604483!';

const TABS = [
  { id: 'overview', label: 'Dashboard' },
  { id: 'modules', label: 'Modules' },
  { id: 'projects', label: 'Projects & AI' },
  { id: 'snowflake-explorer', label: 'Snowflake Explorer' },
  { id: 'security-adv', label: 'Security & Audit' },
  { id: 'cost', label: 'Cost & Performance' },
  { id: 'platform-activity', label: 'Platform Activity' },
];

async function tryFill(page: Page, selectors: string[], value: string) {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.count() > 0) { await el.fill(value); return; }
  }
}

test('account-overview: capture errors per tab', async ({ page }) => {
  test.setTimeout(360_000);

  // ─── 1. Auth
  await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' });
  await tryFill(page, ['input[name="account"]', 'input[name="account_name"]', 'input[name="accountName"]', 'input[placeholder*="account" i]'], ACCOUNT);
  await tryFill(page, ['input[name="username"]', 'input[name="email"]'], USER);
  await tryFill(page, ['input[name="password"]', 'input[type="password"]'], PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(u => !u.toString().includes('/signin'), { timeout: 60_000 });
  console.log('AUTH OK, landed at:', page.url());

  // ─── 2. Goto account-overview
  await page.goto(`${BASE}/account-overview`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  type ApiErr = { tab: string; status: number; method: string; url: string; bodySnippet?: string };
  type ConsoleErr = { tab: string; text: string };
  const apiErrors: ApiErr[] = [];
  const consoleErrors: ConsoleErr[] = [];
  let currentTab = 'init';

  page.on('response', async resp => {
    const status = resp.status();
    const url = resp.url();
    if (status >= 400 && (url.includes('api.datalab360.io') || url.includes('/api/') || url.includes(BASE))) {
      let body = '';
      try { body = (await resp.text()).slice(0, 300); } catch {}
      apiErrors.push({ tab: currentTab, status, method: resp.request().method(), url: url.replace(BASE, ''), bodySnippet: body });
    }
  });
  page.on('console', m => {
    if (m.type() === 'error') consoleErrors.push({ tab: currentTab, text: m.text().slice(0, 300) });
  });
  page.on('pageerror', e => consoleErrors.push({ tab: currentTab, text: 'pageerror: ' + e.message }));

  // ─── 3. Iterate tabs
  for (const t of TABS) {
    currentTab = t.id;
    console.log(`\n=== TAB: ${t.label} (${t.id}) ===`);
    const before = apiErrors.length;
    const beforeC = consoleErrors.length;

    const btn = page.locator(`button:has-text("${t.label}"), [role="tab"]:has-text("${t.label}")`).first();
    if (await btn.count() === 0) {
      console.log(`  ⚠ tab button not found for "${t.label}"`);
      continue;
    }
    await btn.click().catch(e => console.log('click err:', e.message));
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const fname = `/tmp/data360-acctov-${t.id}.png`;
    await page.screenshot({ path: fname, fullPage: true }).catch(() => {});
    console.log(`  📸 ${fname}`);
    console.log(`  api errors during this tab: ${apiErrors.length - before}, console errors: ${consoleErrors.length - beforeC}`);
  }

  // ─── 4. Final report
  console.log('\n\n========== ALL API ERRORS ==========');
  console.log(JSON.stringify(apiErrors, null, 2));
  console.log('\n========== ALL CONSOLE ERRORS ==========');
  console.log(JSON.stringify(consoleErrors, null, 2));
  console.log(`\nTOTAL: ${apiErrors.length} api, ${consoleErrors.length} console`);

  // Write to file for review
  const fs = require('fs');
  fs.writeFileSync('/tmp/account-overview-errors.json', JSON.stringify({ apiErrors, consoleErrors }, null, 2));
});
