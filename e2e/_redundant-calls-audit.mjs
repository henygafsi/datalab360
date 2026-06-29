// Capture REDUNDANT API calls per page load: count requests grouped by path
// (query stripped), flag any endpoint hit >1x during a single page render, and
// surface query-variant duplicates (e.g. /summary vs /summary?days=30).
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const PASS = process.env.DATA360_E2E_PASSWORD || '';
const ROUTES = (process.env.ROUTES ||
  '/account-overview,/governance,/governance/security-matrix,/governance/policies,/governance/users,/data-products,/data-quality,/observability,/explore-design,/workflow,/intelligent,/sources,/administration,/admin/api-health'
).split(',');

const norm = (u) => u.replace(BASE, '').replace('/api-proxy', '').split('?')[0]
  .replace(/\/[0-9a-f-]{8,}/gi, '/{id}')           // uuid/hex ids
  .replace(/\/(uchsfvb-[^/]+|proj_[^/]+|ahr_[^/]+)/gi, '/{id}');

const p = await chromium.launch();
const page = await (await p.newContext()).newPage();
let reqs = [];
page.on('request', r => {
  const u = r.url();
  if (u.includes('/api-proxy/') || /\/(command-center|gouvernance|org-accounts|catalog|data-products|observability|notifications|deployments|access-requests|admin|api|user|common|workflow|explore-design|connect|data-quality|cortex)\b/.test(u.replace(BASE,''))) {
    if (!u.includes('/cache-stream/')) reqs.push(norm(u) + (u.includes('?') ? '?'+u.split('?')[1].slice(0,40) : ''));
  }
});

const allDupes = {};
try {
  await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="account_name"]', { timeout: 20000 });
  for (const [n,v] of [['account_name','uchsfvb-HAHA'],['username','HAHA'],['password',PASS]]) {
    const el = page.locator(`input[name="${n}"]`);
    for (let a=0;a<4;a++){ await el.click(); await el.fill(''); await page.waitForTimeout(60); await el.pressSequentially(v,{delay:55}); await page.waitForTimeout(120); if((await el.inputValue().catch(()=>''))===v) break; }
  }
  await page.click('button[type="submit"]');
  await page.waitForURL(u=>!u.toString().includes('/signin'),{timeout:45000}).catch(()=>{});
  await page.waitForTimeout(5000);
  console.log('LOGIN OK\n');

  for (const route of ROUTES) {
    reqs = [];
    await page.goto(`${BASE}${route}`, { waitUntil:'domcontentloaded' }).catch(()=>{});
    await page.waitForTimeout(7000);
    // count by path (query stripped) to find same-endpoint repeats
    const byPath = {};
    for (const r of reqs) { const path = r.split('?')[0]; (byPath[path] ??= []).push(r); }
    const dupes = Object.entries(byPath).filter(([,v]) => v.length >= 2).sort((a,b)=>b[1].length-a[1].length);
    console.log(`### ${route} — ${reqs.length} api calls, ${dupes.length} redundant endpoint(s)`);
    for (const [path, calls] of dupes) {
      const variants = [...new Set(calls)];
      console.log(`   ${calls.length}x  ${path}${variants.length>1?'  [variants: '+variants.map(v=>v.includes('?')?'?'+v.split('?')[1]:'(none)').join(' | ')+']':''}`);
      allDupes[path] = (allDupes[path]||0) + (calls.length - 1); // count wasted (n-1)
    }
  }
  console.log('\n=== TOP REDUNDANT ENDPOINTS (wasted calls summed across routes) ===');
  for (const [path,waste] of Object.entries(allDupes).sort((a,b)=>b[1]-a[1]).slice(0,25)) console.log(`   +${waste}  ${path}`);
} catch(e){ console.log('FATAL', String(e).slice(0,200)); }
finally { await p.close(); }
