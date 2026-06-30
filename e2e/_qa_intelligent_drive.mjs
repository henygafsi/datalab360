import { chromium } from '@playwright/test';
const TABS=['semantic-models','ai-console','cortex-chat','ai-advisor','ml-features','advanced-ml','query-analytics','local-analytics','snowpark-services','cortex-agents','semantic-views','vector-search'];
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state-minted.json'});
const pg=await ctx.newPage();
const cerr=[];const net=[];
pg.on('console',m=>{if(m.type()==='error')cerr.push(m.text().slice(0,200));});
pg.on('response',async r=>{const s=r.status();if(s>=400){let u=r.url().replace('http://localhost:3000','').replace('http://localhost:8000','BE');net.push(`${s} ${u.slice(0,120)}`);}});
async function go(tab){
  await pg.goto(`http://localhost:3000/intelligent?tab=${tab}`,{waitUntil:'domcontentloaded',timeout:60000}).catch(e=>console.log('goto-err',tab,e.message));
  // poll for content
  for(let i=0;i<25;i++){const t=await pg.evaluate(()=>document.querySelector('[role=tabpanel]')?.innerText||'');if(t.length>40)break;await pg.waitForTimeout(2000);}
  await pg.waitForTimeout(2500);
}
await go('semantic-models');
const url=pg.url();
const signin=await pg.evaluate(()=>/sign in|login|unauthor/i.test(document.body.innerText));
console.log('FIRST URL',url,'signin?',signin);
for(const t of TABS){
  await go(t);
  const panel=await pg.evaluate(()=>document.querySelector('[role=tabpanel]')?.innerText||'NO_PANEL');
  console.log(`\n===== TAB ${t} ===== len=${panel.length}`);
  console.log(panel.slice(0,900).replace(/\n{2,}/g,'\n'));
  await pg.screenshot({path:`docs/product-readiness-audit/screens/qa/intelligent-${t}.png`}).catch(()=>{});
}
console.log('\n##### CONSOLE ERRORS #####');console.log([...new Set(cerr)].slice(0,25).join('\n'));
console.log('\n##### NET >=400 #####');console.log([...new Set(net)].slice(0,40).join('\n'));
await b.close();
