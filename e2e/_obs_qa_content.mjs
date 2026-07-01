import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3000';
const STATE = path.resolve(__dirname, '.auth/state-minted.json');
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: STATE, viewport: { width:1500, height:980 } });
const page = await ctx.newPage();

async function mainText(){
  // grab the content region after breadcrumb 'Home'
  const t = await page.locator('main, [role="main"]').first().innerText({timeout:4000}).catch(()=>'');
  if (t) return t;
  return await page.locator('body').innerText({timeout:4000}).catch(()=>'');
}
async function go(route){
  await page.goto(`${BASE}${route}`,{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
  await page.waitForTimeout(8000);
}

// dashboard tabs
await go('/observability');
const tabs=['Health & Insights','Compliance','Tasks & Lineage','Cross-Modules & Objects','Impact Analysis'];
for(const lbl of tabs){
  const btn=page.locator('button',{hasText:lbl}).first();
  if(await btn.count()){ await btn.click().catch(()=>{}); await page.waitForTimeout(6000); }
  let t=await mainText();
  // strip nav noise by finding 'Observability' second occurrence
  console.log(`\n######## TAB: ${lbl} ########`);
  console.log(t.replace(/\n{2,}/g,'\n').slice(0,2000));
  // enumerate buttons in main
  const btns = await page.locator('main button, [role="main"] button').all().catch(()=>[]);
  const labels=[];
  for(const b of btns.slice(0,60)){ const x=(await b.innerText({timeout:600}).catch(()=>'')).trim().replace(/\n/g,' '); const dis=await b.isDisabled().catch(()=>false); if(x) labels.push(`${dis?'[DIS]':'[EN]'}${x.slice(0,40)}`); }
  console.log('  BUTTONS:', [...new Set(labels)].join(' | '));
}

const subs=['/observability/freshness','/observability/budget','/observability/alerts','/observability/slo','/observability/trust-center','/observability/dependencies','/observability/lineage'];
for(const r of subs){
  await go(r);
  let t=await mainText();
  console.log(`\n######## ROUTE: ${r} ########`);
  console.log(t.replace(/\n{2,}/g,'\n').slice(0,1800));
  const btns = await page.locator('main button, [role="main"] button').all().catch(()=>[]);
  const labels=[];
  for(const b of btns.slice(0,60)){ const x=(await b.innerText({timeout:600}).catch(()=>'')).trim().replace(/\n/g,' '); const dis=await b.isDisabled().catch(()=>false); if(x) labels.push(`${dis?'[DIS]':'[EN]'}${x.slice(0,40)}`); }
  console.log('  BUTTONS:', [...new Set(labels)].join(' | '));
}
await browser.close();
console.log('\nDONE');
