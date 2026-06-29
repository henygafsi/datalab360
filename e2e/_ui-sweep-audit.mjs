// Broad UI clear-display sweep: login as HAHA, visit every dashboard route,
// flag render crashes (pageerror), error boundaries, and failed (>=400) requests.
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const ACCOUNT = 'uchsfvb-HAHA', USER = 'HAHA', PASS = process.env.DATA360_E2E_PASSWORD || '';

const ROUTES = (process.env.ROUTES || [
  '/account-overview','/admin','/admin/api-health','/admin/data360-config','/admin/performance',
  '/admin/platform-settings','/administration','/administration/access-center','/administration/feature-governance',
  '/bi-dashboard','/client-accounts','/data-products','/data-quality','/data-source-config',
  '/data-source-connection','/deploy-app','/email-templates','/explore-design','/governance',
  '/governance/grants','/governance/oauth','/governance/policies','/governance/projects','/governance/roles',
  '/governance/security-matrix','/governance/users','/intelligent','/mapping','/observability',
  '/observability/alerts','/observability/budget','/observability/dependencies','/observability/freshness',
  '/observability/lineage','/observability/slo','/observability/trust-center','/profile','/project',
  '/sources','/users','/workflow','/workflow/dev-tools',
].join(',')).split(',');

const p = await chromium.launch();
const ctx = await p.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [], failed = [];
page.on('pageerror', e => pageErrors.push((e.message || String(e)).slice(0, 160)));
page.on('response', r => { if (r.status() >= 400 && !/\.(png|jpg|svg|woff|ico)/.test(r.url())) failed.push(`${r.status()} ${r.url().replace(BASE,'').split('?')[0]}`); });

const broken = [];
try {
  await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="account_name"]', { timeout: 20000 });
  for (const [name, val] of [['account_name', ACCOUNT], ['username', USER], ['password', PASS]]) {
    const el = page.locator(`input[name="${name}"]`);
    for (let a = 0; a < 4; a++) { await el.click(); await el.fill(''); await page.waitForTimeout(60); await el.pressSequentially(val, { delay: 55 }); await page.waitForTimeout(120); if ((await el.inputValue().catch(()=>'')) === val) break; }
  }
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.toString().includes('/signin'), { timeout: 45000 }).catch(()=>{});
  await page.waitForTimeout(4000);
  if (page.url().includes('/signin')) { console.log('LOGIN FAILED'); await p.close(); process.exit(1); }
  console.log('LOGIN OK ->', page.url(), '\n');

  for (const route of ROUTES) {
    pageErrors.length = 0; failed.length = 0;
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' }).catch(()=>{});
    await page.waitForTimeout(6500); // dev compile + data
    const body = (await page.locator('body').innerText().catch(()=> '')) || '';
    const eb = /something went wrong|encountered a rendering error|an error occurred while loading/i.test(body);
    const blank = body.trim().length < 40;
    const status = pageErrors.length ? 'CRASH' : eb ? 'ERR_BOUNDARY' : blank ? 'BLANK' : 'ok';
    if (status !== 'ok') broken.push({ route, status, pageErrors: [...pageErrors].slice(0,1), failed: [...failed].slice(0,3) });
    console.log(`${status === 'ok' ? 'ok  ' : status.padEnd(12)} ${route}${status !== 'ok' ? '  err='+(pageErrors[0]||'')+' failed='+failed.slice(0,2).join(',') : ''}`);
  }
} catch (e) { console.log('FATAL', String(e).slice(0,200)); }
finally {
  console.log('\n=== BROKEN (' + broken.length + ') ===');
  for (const b of broken) console.log(`  ${b.status} ${b.route} :: ${b.pageErrors[0]||''} :: ${b.failed.join(' ; ')}`);
  await p.close();
}
