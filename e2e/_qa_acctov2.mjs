import { chromium } from '@playwright/test';
import { resolve } from 'path';
const BASE='http://localhost:3000';
const AUTH=resolve('e2e/.auth/state-minted.json');
const TABS=['overview','dwh-plan','finops','projects','modules','snowflake-objects'];
const browser=await chromium.launch();
const ctx=await browser.newContext({storageState:AUTH,viewport:{width:1440,height:1100}});
const page=await ctx.newPage();
let calls=[];
page.on('response',r=>{const u=r.url();if(u.includes(':8000')||u.includes('/api/')){calls.push(`[${r.status()}] ${u.replace(/.*:8000/,'').replace(BASE,'').split('?')[0]}`);}});
for(const t of TABS){
  calls=[];
  const url=`${BASE}/account-overview?tab=${t}`;
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(13000);
  const info=await page.evaluate(()=>{
    const panel=document.getElementById(document.querySelector('[id^=tabpanel-]')?.id||'');
    const p=document.querySelector('[role=tabpanel], [id^=tabpanel-]');
    const txt=p?p.innerText:'(no panel)';
    return {plen:txt.length, ptxt:txt.replace(/\s+/g,' ').slice(0,700), svgs:(p?p.querySelectorAll('svg').length:0), canvas:(p?p.querySelectorAll('canvas').length:0), tables:(p?p.querySelectorAll('table').length:0), cards:(p?p.querySelectorAll('[class*=rounded]').length:0)};
  });
  const uniq=[...new Set(calls)];
  console.log(`=== ${t} panelTextLen=${info.plen} svg=${info.svgs} canvas=${info.canvas} tbl=${info.tables} cards=${info.cards}`);
  console.log('  panel:',info.ptxt);
  console.log('  APIs:',JSON.stringify(uniq));
  await page.screenshot({path:`docs/product-readiness-audit/screens/qa/account-overview-${t}.png`,fullPage:true}).catch(()=>{});
}
await browser.close();
