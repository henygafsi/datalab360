import { chromium } from '@playwright/test';
const BASE='http://localhost:3000', AUTH='e2e/.auth/state-minted.json';
const api={};
const browser=await chromium.launch();
const ctx=await browser.newContext({storageState:AUTH, viewport:{width:1500,height:1000}});
const page=await ctx.newPage();
page.setDefaultTimeout(4000);
page.on('response',r=>{const u=r.url();if(/\/data-quality\//.test(u)&&r.request().method()==='GET'){api[u.replace(BASE,'').split('?')[0]]=r.status();}});
await page.goto(`${BASE}/data-quality`,{waitUntil:'domcontentloaded'});
for(let i=0;i<35;i++){const h=await page.locator('h1').first().textContent().catch(()=>'')||'';if(/Data Quality/i.test(h))break;await page.waitForTimeout(1000);}
await page.waitForTimeout(3000);
const TABS=['Uniqueness','Freshness','Ingestion','Schema','Classification','Storage','Security','DMF Results'];
for(const t of TABS){
  try{ await page.getByRole('button',{name:t,exact:true}).first().click({timeout:4000}); }
  catch(e){ console.log(`TAB ${t}: click failed ${e.message.slice(0,40)}`); continue; }
  await page.waitForTimeout(1500);
  const rows=await page.locator('table tbody tr').count().catch(()=>0);
  console.log(`TAB ${t}: domRows=${rows}`);
}
console.log('--- DQ GET CALLS ---');
for(const [k,v] of Object.entries(api)) console.log(`${v}  ${k}`);
await browser.close(); process.exit(0);
