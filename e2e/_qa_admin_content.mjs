import { chromium } from '@playwright/test';
const STATE='/Users/datalab360/Documents/data360_pro/datalab360Front/e2e/.auth/state-minted.json';
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,viewport:{width:1440,height:1000}});
const p=await c.newPage();
for(const t of ['health','performance','costGov','serverMetrics']){
  await p.goto(`http://localhost:3000/administration?tab=${t}`,{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForTimeout(6000);
  const txt=await p.evaluate(()=>{
    const el=document.querySelector('div.min-w-0.flex-1.overflow-auto')||document.querySelector('main');
    return (el?.innerText||'').replace(/\s+/g,' ').trim();
  });
  console.log(`\n##### ${t} #####\n`+txt.slice(0,1400));
}
await b.close();
