import { chromium } from '@playwright/test';
const BASE='http://localhost:3000', STATE='/Users/datalab360/Documents/data360_pro/datalab360Front/e2e/.auth/state-minted.json';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:STATE,viewport:{width:1700,height:1050}});
const p=await ctx.newPage();
await p.goto(`${BASE}/data-products`,{waitUntil:'domcontentloaded',timeout:120000}).catch(()=>{});
// wait until the Trust Score KPI shows a NUMBER (data loaded), up to ~40s
let val='—';
for(let i=0;i<28;i++){
  await p.waitForTimeout(1500);
  val = await p.evaluate(()=>{
    const cards=[...document.querySelectorAll('*')].filter(e=>e.textContent && e.textContent.trim()==='TRUST SCORE');
    for(const c of cards){ let n=c.parentElement; for(let d=0;d<4&&n;d++){const num=n.textContent.match(/\b(\d{1,3})\b/); if(num) return num[1]; n=n.parentElement;} }
    return '—';
  }).catch(()=>'—');
  if(val!=='—') break;
}
console.log('P1-5 Trust Score value:', val, '(expect ~82)');
await p.screenshot({path:'docs/product-readiness-audit/screens/qa/p1_data_products.png'});
await b.close();
