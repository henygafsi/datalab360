import { chromium } from '@playwright/test';
const BASE='http://localhost:3000', AUTH='e2e/.auth/state-minted.json';
const ce=[], ne=[];
const browser=await chromium.launch();
const ctx=await browser.newContext({storageState:AUTH, viewport:{width:1500,height:1000}});
const page=await ctx.newPage();
page.on('console',m=>{if(m.type()==='error')ce.push(m.text().slice(0,200));});
page.on('response',r=>{if(r.status()>=400)ne.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE,'')}`);});
await page.goto(`${BASE}/data-quality`,{waitUntil:'domcontentloaded'});
let h1='';
for(let i=0;i<40;i++){h1=await page.locator('h1').first().textContent().catch(()=>'')||'';if(/Data Quality/i.test(h1))break;await page.waitForTimeout(1000);}
console.log('H1:',JSON.stringify(h1));
await page.waitForTimeout(5000);
const btns=await page.locator('button').allTextContents();
console.log('BTNS:',JSON.stringify([...new Set(btns.map(b=>b.trim()).filter(Boolean))].slice(0,45)));
await page.screenshot({path:'docs/product-readiness-audit/screens/qa/data-quality.png',fullPage:true}).catch(()=>{});
console.log('CE:',JSON.stringify(ce.slice(0,20)));
console.log('NE:',JSON.stringify([...new Set(ne)].slice(0,40)));
await browser.close();
