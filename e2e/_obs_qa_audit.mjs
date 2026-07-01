import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3000';
const STATE = path.resolve(__dirname, '.auth/state-minted.json');
const SHOTDIR = path.resolve(__dirname, '../docs/product-readiness-audit/screens/qa');

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: STATE, viewport: { width: 1500, height: 980 } });
const page = await ctx.newPage();

const net = [];      // >=400 network
const consoleErr = [];
const pageErr = [];
page.on('response', r => {
  const u = r.url();
  if (r.status() >= 400 && !/\.(png|jpg|jpeg|svg|woff2?|ico|css|js)(\?|$)/.test(u)) {
    net.push(`${r.status()} ${r.request().method()} ${u.replace(BASE,'')}`);
  }
});
page.on('console', m => { if (m.type()==='error') consoleErr.push(m.text().slice(0,240)); });
page.on('pageerror', e => pageErr.push((e.message||String(e)).slice(0,240)));

async function bodyText(){ return (await page.locator('body').innerText({timeout:4000}).catch(()=>'')).slice(0,600); }

async function waitReal(label){
  for (let i=0;i<25;i++){
    const t = await bodyText();
    if (/sign in|signin/i.test(t) && t.length<200) { await page.waitForTimeout(2000); continue; }
    if (t && t.length>40 && !/warming up|cache is initializing|initializing/i.test(t)) return t;
    await page.waitForTimeout(2000);
  }
  return await bodyText();
}

async function visit(route, name){
  net.length=0; consoleErr.length=0; pageErr.length=0;
  console.log(`\n===== ${route} =====`);
  await page.goto(`${BASE}${route}`, {waitUntil:'domcontentloaded', timeout:40000}).catch(e=>console.log('goto err',e.message));
  const t = await waitReal(name);
  console.log('URL:', page.url());
  console.log('BODY[0..400]:', t.slice(0,400).replace(/\n+/g,' | '));
  await page.screenshot({ path: `${SHOTDIR}/${name}.png`, fullPage:false }).catch(()=>{});
  if (net.length) console.log('NET>=400:', [...new Set(net)].join(' ;; '));
  if (consoleErr.length) console.log('CONSOLE_ERR:', [...new Set(consoleErr)].slice(0,5).join(' ;; '));
  if (pageErr.length) console.log('PAGE_ERR:', [...new Set(pageErr)].slice(0,5).join(' ;; '));
  return t;
}

// 1) Main dashboard + its in-page tabs
await visit('/observability', 'observability');
// enumerate tab pills (top-level tabs)
const tabLabels = ['Health & Insights','Compliance','Tasks & Lineage','Cross-Modules & Objects','Impact Analysis'];
for (const lbl of tabLabels){
  net.length=0; consoleErr.length=0; pageErr.length=0;
  const btn = page.locator('button', {hasText: lbl}).first();
  const exists = await btn.count();
  if (!exists){ console.log(`\n--- TAB "${lbl}" : NOT FOUND`); continue; }
  await btn.click({timeout:5000}).catch(e=>console.log('click err',e.message));
  await page.waitForTimeout(4000);
  const t = await bodyText();
  console.log(`\n--- TAB "${lbl}" --- ${t.slice(0,260).replace(/\n+/g,' | ')}`);
  await page.screenshot({ path: `${SHOTDIR}/observability-tab-${lbl.replace(/[^a-z0-9]+/gi,'_').toLowerCase()}.png` }).catch(()=>{});
  if (net.length) console.log('  NET>=400:', [...new Set(net)].join(' ;; '));
  if (consoleErr.length) console.log('  CONSOLE_ERR:', [...new Set(consoleErr)].slice(0,4).join(' ;; '));
  if (pageErr.length) console.log('  PAGE_ERR:', [...new Set(pageErr)].slice(0,4).join(' ;; '));
}

// 2) subroutes
const subs = [
  ['/observability/lineage','observability-lineage'],
  ['/observability/dependencies','observability-dependencies'],
  ['/observability/freshness','observability-freshness'],
  ['/observability/budget','observability-budget'],
  ['/observability/alerts','observability-alerts'],
  ['/observability/slo','observability-slo'],
  ['/observability/trust-center','observability-trust-center'],
];
for (const [r,n] of subs) await visit(r,n);

await browser.close();
console.log('\n\nDONE');
