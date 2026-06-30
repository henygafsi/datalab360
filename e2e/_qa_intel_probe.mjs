import { chromium } from '@playwright/test';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state-minted.json'});
const pg=await ctx.newPage();
const net=[];
pg.on('response',r=>{const s=r.status();if(s>=400)net.push(`${s} ${r.url().replace('http://localhost:3000','').replace('http://localhost:8000','BE').slice(0,90)}`);});
// AI Console -> Validate (read-only)
await pg.goto('http://localhost:3000/intelligent?tab=ai-console',{waitUntil:'domcontentloaded'});
await pg.waitForTimeout(6000);
const vbtn=pg.getByRole('button',{name:/^Validate$/});
const vis=await vbtn.isVisible().catch(()=>false);
console.log('Validate visible',vis,'disabled',vis?await vbtn.isDisabled():'-');
if(vis&&!(await vbtn.isDisabled())){await vbtn.click();await pg.waitForTimeout(4000);const panel=await pg.evaluate(()=>document.querySelector('[role=tabpanel]')?.innerText||'');console.log('after Validate(no model) snippet:',panel.slice(0,200).replace(/\n+/g,' '));}
// cortex-agents Refresh
await pg.goto('http://localhost:3000/intelligent?tab=cortex-agents',{waitUntil:'domcontentloaded'});
await pg.waitForTimeout(5000);
const rb=pg.getByRole('button',{name:/Refresh/});
const rv=await rb.first().isVisible().catch(()=>false);
console.log('agents Refresh visible',rv);
if(rv){await rb.first().click();await pg.waitForTimeout(3000);console.log('clicked agents Refresh ok');}
console.log('NET>=400:',[...new Set(net)].join(' | ')||'none');
await b.close();
