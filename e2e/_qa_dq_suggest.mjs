import { chromium } from '@playwright/test';
const BASE='http://localhost:3000', AUTH='e2e/.auth/state-minted.json';
const net=[];
const browser=await chromium.launch();
const ctx=await browser.newContext({storageState:AUTH, viewport:{width:1500,height:1000}});
const page=await ctx.newPage(); page.setDefaultTimeout(6000);
page.on('response',r=>{if(/dmf\/suggest/.test(r.url()))net.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE,'').split('?')[0]}`);});
await page.goto(`${BASE}/data-quality`,{waitUntil:'domcontentloaded'});
for(let i=0;i<35;i++){const h=await page.locator('h1').first().textContent().catch(()=>'')||'';if(/Data Quality/i.test(h))break;await page.waitForTimeout(1000);}
await page.waitForTimeout(3000);
// select a row in completeness table to give the Suggest button a table context
await page.locator('table tbody tr').first().click().catch(e=>console.log('rowclick',e.message.slice(0,40)));
await page.waitForTimeout(1500);
// find Suggest button (label likely "Suggest DMFs" or "Suggest")
const sug=page.getByRole('button',{name:/Suggest/i}).first();
console.log('Suggest btn count:', await sug.count());
await sug.click().catch(e=>console.log('sugclick',e.message.slice(0,40)));
await page.waitForTimeout(3500);
const panel=await page.locator('.fixed, [role=dialog], aside, [role=alert]').filter({hasText:/suggest|DMF|fail|error/i}).allTextContents().catch(()=>[]);
console.log('PANEL/ALERT:', JSON.stringify(panel.map(p=>p.replace(/\s+/g,' ').trim().slice(0,110)).slice(0,4)));
console.log('SUGGEST NET:', JSON.stringify(net));
await browser.close(); process.exit(0);
