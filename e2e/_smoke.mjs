// Reusable runtime smoke-verify: login once, then load each route and assert it
// actually RENDERS (not a 500 / Next error overlay / empty shell) + capture console errors.
// Usage: BASE=http://localhost:3000 node e2e/_smoke.mjs /account-overview /governance /workflow
// Output: per-route PASS/FAIL + a JSON summary line (SMOKE_JSON {...}) for machine parsing.
import { chromium } from '@playwright/test';

const BASE = process.env.BASE || 'http://localhost:3000';
const ACCOUNT = process.env.DATA360_E2E_ACCOUNT || 'HAHA';
const USERNAME = process.env.DATA360_E2E_USER || 'HAHA';
const PASSWORD = process.env.DATA360_E2E_PASSWORD || '';
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
  if (!PASSWORD) throw new Error('DATA360_E2E_PASSWORD is required');
  await p.waitForSelector('input[name="account_name"]', { timeout: 15000 });
  await p.fill('input[name="account_name"]', ACCOUNT);
  await p.fill('input[name="username"]', USERNAME);
  await p.fill('input[name="password"]', PASSWORD);
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
  // Detect a REAL error page/overlay (not arbitrary body text — monitoring pages legitimately
  // render "500"/"Not Found" as DATA). Check the Next.js error portal + title + a tiny error body.
  const hasErrorOverlay = await p.evaluate(() => {
    if (document.querySelector('nextjs-portal')) return true;
    const t = (document.title || '').trim();
    if (/^(404|500|Application error|Internal Server Error)/i.test(t)) return true;
    const h1 = document.querySelector('h1');
    const len = (document.body?.innerText || '').length;
    if (h1 && /Application error|something went wrong|could not be found/i.test(h1.textContent || '') && len < 400) return true;
    return false;
  }).catch(() => false);
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
