import { chromium } from '@playwright/test';
const STATE='/Users/datalab360/Documents/data360_pro/datalab360Front/e2e/.auth/state-minted.json';
const b=await chromium.launch();
const c=await b.newContext({storageState:STATE,viewport:{width:1440,height:1000}});
const p=await c.newPage();
const net=[];
p.on('response',r=>{if(r.status()>=400)net.push(`${r.status()} ${r.url()}`)});
for(const t of ['health','serverMetrics']){
  net.length=0;
  await p.goto(`http://localhost:3000/administration?tab=${t}`,{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForTimeout(18000);
  const txt=await p.evaluate(()=>{
    const el=document.querySelector('div.min-w-0.flex-1.overflow-auto')||document.querySelector('main');
    return (el?.innerText||'').replace(/\s+/g,' ').trim();
  });
  console.log(`\n##### ${t} #####\n`+txt.slice(0,1100));
  console.log('NET>=400:', JSON.stringify([...new Set(net)]));
}
await b.close();
