import { chromium } from '@playwright/test';
const BASE='http://localhost:3000';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state.json',viewport:{width:1600,height:1000}});
const p=await ctx.newPage();
await p.goto(`${BASE}/administration?tab=apiHealth`,{waitUntil:'domcontentloaded',timeout:90000}).catch(e=>console.log('nav:',e.message));
await p.waitForTimeout(9000); // let auto-probe complete
const body=(await p.locator('body').innerText().catch(()=>'')).replace(/\s+/g,' ');
console.log('API Catalog header:', body.includes('API Catalog'));
console.log('KPIs:', (body.match(/(\d+) Wired/)||[])[0], (body.match(/(\d+) Parent/)||[])[0], (body.match(/(\d+) Unwired/)||[])[0]);
// count green 200 badges visible
const greens=await p.locator('text=/^200$/').count().catch(()=>0);
const statuses=await p.locator('td span').filter({hasText:/^(200|404|500|403|ERR)$/}).allInnerTexts().catch(()=>[]);
console.log('live status badges rendered:', statuses.length, '->', [...new Set(statuses)].join(','));
await p.screenshot({path:'docs/product-readiness-audit/screens/admin-green/api_catalog_green.png',fullPage:false});
await b.close();
