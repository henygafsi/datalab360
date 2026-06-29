// Pages + OUTPUTS audit. Logs in as HAHA (ACCOUNTADMIN), visits every dashboard
// route + key tabs, and for each captures: render status (CRASH/ERR_BOUNDARY/
// BLANK/ok), EVERY /api-proxy call (path + status + data-presence), a content
// signal, and a screenshot. Emits structured JSON so findings can be classified
// by CAUSE (FE bug vs backend-down vs unprovisioned-cache vs missing feature).
//
// Run:  DATA360_E2E_PASSWORD='...' node e2e/_pages-outputs-audit.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const ACCOUNT = process.env.DATA360_ACCOUNT || 'uchsfvb-HAHA';
const USER = process.env.DATA360_USER || 'HAHA';
const PASS = process.env.DATA360_E2E_PASSWORD || '';
const OUT = 'e2e/results/pages-audit';
mkdirSync(OUT, { recursive: true });

// Heavy routes get a longer settle + one reload-on-blank (dev-compile false blanks)
const HEAVY = new Set(['/bi-dashboard', '/explore-design', '/data-quality', '/observability/lineage']);
const heavyPrefix = (r) => r.startsWith('/intelligent');

const ROUTES = (process.env.ROUTES || [
  // core
  '/', '/account-overview', '/profile', '/project', '/client-accounts',
  // data & analytics
  '/sources', '/data-products', '/data-quality', '/explore-design', '/bi-dashboard', '/mapping',
  // pipeline
  '/data-source-connection', '/data-source-config', '/workflow', '/workflow/dev-tools', '/deploy-app',
  // intelligent tabs
  '/intelligent',
  '/intelligent?tab=semantic-models', '/intelligent?tab=ai-console', '/intelligent?tab=cortex-chat',
  '/intelligent?tab=ai-advisor', '/intelligent?tab=ml-features', '/intelligent?tab=advanced-ml',
  '/intelligent?tab=query-analytics', '/intelligent?tab=local-analytics', '/intelligent?tab=snowpark-services',
  '/intelligent?tab=cortex-agents', '/intelligent?tab=semantic-views', '/intelligent?tab=vector-search',
  // governance
  '/governance', '/governance/users', '/governance/roles', '/governance/grants', '/governance/policies',
  '/governance/projects', '/governance/oauth', '/governance/security-matrix',
  // observability
  '/observability', '/observability/alerts', '/observability/budget', '/observability/dependencies',
  '/observability/freshness', '/observability/lineage', '/observability/slo', '/observability/trust-center',
  // administration tabs
  '/administration', '/administration?tab=health', '/administration?tab=performance', '/administration?tab=access',
  '/administration?tab=costGov', '/administration?tab=projects', '/administration?tab=featureGov',
  '/administration?tab=apiHealth', '/administration?tab=serverMetrics', '/administration?tab=config',
  '/administration/access-center', '/administration/feature-governance',
  // admin (legacy)
  '/admin', '/admin/api-health', '/admin/data360-config', '/admin/performance', '/admin/platform-settings',
  // misc
  '/users', '/email-templates',
].join('|')).split('|');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

// per-route API capture
let apiCalls = [];
page.on('response', async (r) => {
  const u = r.url();
  if (!u.includes('/api-proxy/') && !u.includes('api.datalab360.io')) return;
  const path = u.replace(BASE, '').replace('/api-proxy', '').split('?')[0];
  const rec = { path, status: r.status(), data: '?' };
  try {
    const ct = (r.headers()['content-type'] || '');
    if (ct.includes('json') && r.status() < 400) {
      const t = (await r.text()).slice(0, 600);
      rec.data = /^\s*\[\s*\]/.test(t) ? 'empty[]'
        : /^\s*\{\s*\}/.test(t) ? 'empty{}'
        : /^\s*null\s*$/.test(t) ? 'null'
        : /"(items|data|rows|results)"\s*:\s*\[\s*\]/.test(t) ? 'empty-list'
        : 'has-data';
    } else if (r.status() >= 400) rec.data = 'err';
  } catch { rec.data = 'unread'; }
  apiCalls.push(rec);
});

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push((e.message || String(e)).slice(0, 160)));

function safe(route) { return route.replace(/[/?=]/g, '_').replace(/^_/, '') || 'home'; }

async function login() {
  await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="account_name"]', { timeout: 20000 });
  for (const [name, val] of [['account_name', ACCOUNT], ['username', USER], ['password', PASS]]) {
    const el = page.locator(`input[name="${name}"]`);
    for (let a = 0; a < 4; a++) {
      await el.click(); await el.fill(''); await page.waitForTimeout(60);
      await el.pressSequentially(val, { delay: 50 }); await page.waitForTimeout(100);
      if ((await el.inputValue().catch(() => '')) === val) break;
    }
  }
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.toString().includes('/signin'), { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);
  return !page.url().includes('/signin');
}

async function visit(route) {
  apiCalls = []; pageErrors.length = 0;
  const heavy = HEAVY.has(route) || heavyPrefix(route);
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(heavy ? 8500 : 5500);
  let body = (await page.locator('body').innerText().catch(() => '')) || '';
  let blank = body.trim().length < 40;
  if (blank && heavy) { // reload once: false-blank from dev compile
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(7000);
    body = (await page.locator('body').innerText().catch(() => '')) || '';
    blank = body.trim().length < 40;
  }
  const eb = /something went wrong|encountered a rendering error|an error occurred while loading|error boundary/i.test(body);
  const status = pageErrors.length ? 'CRASH' : eb ? 'ERR_BOUNDARY' : blank ? 'BLANK' : 'ok';
  // content signal
  const counts = await page.evaluate(() => ({
    tables: document.querySelectorAll('table, [role="table"], [role="grid"]').length,
    cards: document.querySelectorAll('[class*="card" i]').length,
    emptyMarkers: (document.body.innerText.match(/no data|aucune donnée|nothing to show|empty|—/gi) || []).length,
  })).catch(() => ({ tables: 0, cards: 0, emptyMarkers: 0 }));
  await page.screenshot({ path: `${OUT}/${safe(route)}.png` }).catch(() => {});
  const api = [...apiCalls];
  const apiErr = api.filter((a) => a.status >= 400);
  const apiEmpty = api.filter((a) => /empty|null/.test(a.data));
  const apiOk = api.filter((a) => a.data === 'has-data');
  return {
    route, status, bodyLen: body.trim().length, ...counts,
    apiTotal: api.length, apiErr: apiErr.length, apiEmpty: apiEmpty.length, apiOk: apiOk.length,
    pageError: pageErrors[0] || null,
    apiErrSample: apiErr.slice(0, 5).map((a) => `${a.status} ${a.path}`),
    apiEmptySample: apiEmpty.slice(0, 5).map((a) => `${a.data} ${a.path}`),
  };
}

const results = [];
try {
  if (!(await login())) { console.log('LOGIN_FAILED url=' + page.url()); await browser.close(); process.exit(1); }
  console.log('LOGIN_OK ->', page.url(), '\n');
  // validate one route before fanning out
  const probe = await visit('/account-overview');
  results.push(probe);
  console.log(`${probe.status.padEnd(12)} /account-overview  api=${probe.apiTotal} err=${probe.apiErr} empty=${probe.apiEmpty} ok=${probe.apiOk}`);
  for (const route of ROUTES) {
    if (route === '/account-overview') continue;
    const r = await visit(route);
    results.push(r);
    console.log(`${r.status.padEnd(12)} ${route.padEnd(38)} api=${r.apiTotal} err=${r.apiErr} empty=${r.apiEmpty} ok=${r.apiOk}${r.pageError ? '  ::' + r.pageError : ''}`);
  }
} catch (e) { console.log('FATAL', String(e).slice(0, 200)); }
finally {
  writeFileSync(`${OUT}/summary.json`, JSON.stringify(results, null, 2));
  const bad = results.filter((r) => r.status !== 'ok');
  console.log(`\n=== ${results.length} routes; ${bad.length} non-ok ===`);
  for (const b of bad) console.log(`  ${b.status} ${b.route} :: ${b.pageError || ''} :: ${b.apiErrSample.join(' ; ')}`);
  console.log(`\nJSON -> ${OUT}/summary.json ; screenshots -> ${OUT}/`);
  await browser.close();
}
