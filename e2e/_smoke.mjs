// Reusable runtime smoke-verify: login once, then load each route and assert it
// actually RENDERS (not a 500 / Next error overlay / empty shell) + capture console errors.
// Usage: BASE=http://localhost:3000 node e2e/_smoke.mjs /account-overview /governance /workflow
// Output: per-route PASS/FAIL + a JSON summary line (SMOKE_JSON {...}) for machine parsing.
import { chromium } from '@playwright/test';

const BASE = process.env.BASE || 'http://localhost:3000';
const routes = process.argv.slice(2);
if (routes.length === 0) routes.push('/account-overview');

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 } });
const p = await ctx.newPage();

// ---- login ----
await p.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await p.waitForTimeout(2000);
let loggedIn = false;
try {
  await p.waitForSelector('input[name="account_name"]', { timeout: 15000 });
  await p.fill('input[name="account_name"]', 'HAHA');
  await p.fill('input[name="username"]', 'HAHA');
  await p.fill('input[name="password"]', 'NewSecurePassword123!');
  await p.locator('input[name="password"]').press('Enter');
  await p.waitForTimeout(1500);
  if (p.url().includes('/signin')) await p.click('button[type="submit"]').catch(() => {});
  loggedIn = await p.waitForURL(u => !u.pathname.startsWith('/signin'), { timeout: 25000 }).then(() => true).catch(() => false);
} catch (e) {
  loggedIn = false;
}
console.log('LOGIN', loggedIn, 'url=', p.url());
if (loggedIn) await ctx.storageState({ path: 'e2e/.auth/state.json' }).catch(() => {});

const results = [];
for (const route of routes) {
  const errs = [];
  const onErr = m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); };
  p.on('console', onErr);
  let status = 0;
  const resp = await p.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
  status = resp ? resp.status() : 0;
  await p.waitForTimeout(2500);
  // detect Next error overlay / error boundary / empty shell
  const bodyLen = await p.evaluate(() => document.body?.innerText?.length || 0).catch(() => 0);
  const hasErrorOverlay = await p.locator('text=/Application error|Unhandled Runtime Error|This page could not be found|500|Internal Server Error/i').count().catch(() => 0);
  const visibleButtons = await p.locator('button:visible, a:visible').count().catch(() => 0);
  p.off('console', onErr);
  const pass = status > 0 && status < 400 && !hasErrorOverlay && bodyLen > 200;
  results.push({ route, status, bodyLen, visibleButtons, errCount: errs.length, hasErrorOverlay: !!hasErrorOverlay, pass, sampleErrs: errs.slice(0, 3) });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${route} status=${status} bodyLen=${bodyLen} btns=${visibleButtons} consoleErr=${errs.length}${hasErrorOverlay ? ' OVERLAY' : ''}`);
}
await b.close();
const summary = { loggedIn, base: BASE, total: results.length, passed: results.filter(r => r.pass).length, results };
console.log('SMOKE_JSON', JSON.stringify(summary));
process.exit(summary.passed === summary.total && loggedIn ? 0 : 1);
