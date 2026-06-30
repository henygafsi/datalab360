import { chromium } from '@playwright/test';
const BASE='http://localhost:3000', AUTH='e2e/.auth/state-minted.json';
const net=[];
const browser=await chromium.launch();
const ctx=await browser.newContext({storageState:AUTH, viewport:{width:1500,height:1000}});
const page=await ctx.newPage(); page.setDefaultTimeout(6000);
page.on('response',r=>{if(/dmf\/references/.test(r.url()))net.push(`${r.status()} ${r.url().replace(BASE,'').split('?')[0]}`);});
await page.goto(`${BASE}/data-quality`,{waitUntil:'domcontentloaded'});
for(let i=0;i<35;i++){const h=await page.locator('h1').first().textContent().catch(()=>'')||'';if(/Data Quality/i.test(h))break;await page.waitForTimeout(1000);}
await page.waitForTimeout(2500);
// Go to DMF Results tab where the Manage button lives
await page.getByRole('button',{name:'DMF Results',exact:true}).first().click().catch(()=>{});
await page.waitForTimeout(1500);
// click Manage
const mg=page.getByRole('button',{name:/^Manage/}).first();
console.log('Manage btn count:', await mg.count());
await mg.click().catch(e=>console.log('manage click',e.message.slice(0,40)));
await page.waitForTimeout(1500);
// type a table and Load
const inp=page.getByPlaceholder('CP_DATA360.PUBLIC.ORDERS').first();
await inp.fill('CP_DATA360.PUBLIC.CUSTOMERS').catch(e=>console.log('fill',e.message.slice(0,40)));
await page.getByRole('button',{name:/^Load/}).first().click().catch(e=>console.log('load',e.message.slice(0,40)));
await page.waitForTimeout(3000);
const alert=await page.locator('[role=alert]').filter({hasText:/./}).allTextContents().catch(()=>[]);
console.log('ALERTS:', JSON.stringify(alert.map(a=>a.trim().slice(0,90))));
console.log('REFERENCES NET:', JSON.stringify(net));
await browser.close(); process.exit(0);
