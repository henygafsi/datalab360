// Fleet validation — real data-admin (HAHA) drive of every module page:
// KPI strip + AxisCockpit rail + axis-open + no error/cache banners. Local FE -> ONLINE backend.
import { chromium } from '@playwright/test';
const BASE = 'http://localhost:3000';
const ACC = 'uchsfvb-HAHA', USER = 'HAHA', PASS = process.env.DATA360_E2E_PASSWORD || '';

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1760, height: 1000 } });
const p = await ctx.newPage();
const R = []; const check = (l, c) => { R.push(`${c ? '✓' : '✗'} ${l}`); return c; };

// robust login
let ok = false;
for (let a = 1; a <= 4 && !ok; a++) {
  try {
    await p.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await p.waitForSelector('input[name="account_name"]', { timeout: 60000 });
    // hydration guard: cold next-dev serves the form before React attaches handlers
    await p.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(2500);
    for (const [n, v] of [['account_name', ACC], ['username', USER], ['password', PASS]]) {
      const el = p.locator(`input[name="${n}"]`); await el.click(); await el.fill(''); await el.pressSequentially(v, { delay: 30 });
    }
    await p.click('button[type="submit"]');
    // poll up to 24s; re-click once at 8s in case the first click predated hydration
    for (let t = 0; t < 12 && p.url().includes('/signin'); t++) {
      await p.waitForTimeout(2000);
      if (t === 4) await p.click('button[type="submit"]').catch(() => {});
    }
    ok = !p.url().includes('/signin');
    console.log(`login ${a}: ok=${ok} url=${p.url().slice(0, 60)}`);
  } catch (e) { console.log(`login ${a} err ${String(e).slice(0, 90)}`); }
}
if (!check('login HAHA', ok)) { console.log(R.join('\n')); await b.close(); process.exit(1); }

const BAD = ['application error', 'unhandled runtime', 'something went wrong', 'cache is initializing', 'being provisioned'];

async function visit(path, settle = 12000) {
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 150000 }).catch(() => {});
  await p.waitForTimeout(settle);
  const body = (await p.locator('body').innerText().catch(() => '')) || '';
  return { body, low: body.toLowerCase() };
}
const shot = (n) => p.screenshot({ path: `e2e/.auth/fleet_${n}.png` }).catch(() => {});

// module -> route + expected KPI-ish labels + has shared AxisCockpit rail?
const MODULES = [
  ['account-overview', '/account-overview', ['cost', 'users'], true],
  ['governance', '/governance', ['compliance', 'policies'], true],
  ['workflow', '/workflow', ['workflows', 'runs'], true],
  ['bi', '/bi-dashboard', ['dashboards', 'published'], true],
  ['intelligent', '/intelligent', ['intelligence score', 'recos'], true],
  ['dq', '/data-quality', ['health', 'tables'], true],
  ['observability', '/observability', ['alerts', 'slo'], true],
  ['connect', '/data-source-connection', ['connectors', 'stages'], true],
];

for (const [name, route, kpis, hasCockpit] of MODULES) {
  const r = await visit(route);
  const okPage = check(`${name}: renders (no error/cache banner)`, r.body.length > 400 && !BAD.some(s => r.low.includes(s)));
  check(`${name}: KPI signals [${kpis.join(',')}]`, kpis.every(k => r.low.includes(k)));
  if (hasCockpit) {
    const rail = p.locator('nav[aria-label="Module axes"]').first();
    const railOk = check(`${name}: cockpit rail`, await rail.isVisible().catch(() => false));
    if (railOk) {
      // auto-open cockpits already show a panel (purposeful default) — that IS a pass.
      const panel = p.locator('section[aria-label$=" panel"]').first();
      let vis = await panel.isVisible().catch(() => false);
      if (!vis) {
        await rail.locator('button').first().click().catch(() => {});
        await p.waitForTimeout(2500);
        vis = await panel.isVisible().catch(() => false);
      }
      check(`${name}: axis panel open`, vis);
    }
  }
  await shot(name);
  if (!okPage) console.log(`   [${name}] snippet: ${r.body.slice(0, 180).replace(/\n/g, ' | ')}`);
}

// Explore & Design (own cockpit: ModelKpiStrip + DeployStateButton + ContextRightBar)
{
  const r = await visit('/explore-design', 18000);
  check('explore-design: renders', r.body.length > 400 && !BAD.some(s => r.low.includes(s)));
  // KPI strip needs a selected project; without ?project_id the project gate is the expected state.
  const projectGate = /select.*project|choose.*project|no project|projet/.test(r.low);
  check('explore-design: KPI strip or project-gate', r.low.includes('model health') || projectGate);
  const btns = (await p.locator('button').allInnerTexts().catch(() => [])).map(t => t.toLowerCase());
  check('explore-design: deploy state button', ['deploy', 'prepare release', 'run validation', 'fix blockers', 'submit for approval'].some(s => btns.some(t => t.includes(s))));
  await shot('explore-design');
}

// Administration -> Feature Registry
{
  const r = await visit('/administration?tab=features', 14000);
  check('admin features: registry renders', r.low.includes('feature') && (r.low.includes('registry') || r.low.includes('what it does') || r.low.includes('enforced by role grants')));
  check('admin features: entries listed', (r.body.match(/GET |POST |PUT |DELETE /g) || []).length > 5 || r.low.includes('endpoints'));
  await shot('admin-features');
}

// Chat "Build with AI" entry (project page banner or chat sidebar button)
{
  const r = await visit('/project', 10000);
  check('chat AI-build entry visible', r.low.includes('build with ai'));
  await shot('project-aibuild');
}

await b.close();
console.log('\n=== FLEET VALIDATION (HAHA, online backend) ===');
R.forEach(x => console.log(' ' + x));
const pass = R.filter(x => x.startsWith('✓')).length;
console.log(`\n${pass}/${R.length} checks passed`);
process.exit(pass === R.length ? 0 : 2);
