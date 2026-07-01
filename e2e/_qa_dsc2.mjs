import { chromium } from '@playwright/test';
const STATE='/Users/datalab360/Documents/data360_pro/datalab360Front/e2e/.auth/state-minted.json';
const URL='http://localhost:3000/data-source-connection';
const netErrs=[]; const ce=[];
const b=await chromium.launch(); const ctx=await b.newContext({storageState:STATE}); const p=await ctx.newPage();
p.on('console',m=>{if(m.type()==='error')ce.push(m.text().slice(0,160));});
p.on('response',r=>{if(r.status()>=400)netErrs.push(`${r.status()} ${r.request().method()} ${r.url().replace(/\?.*/,'').replace('http://localhost:8000','')}`);});
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
await p.waitForTimeout(9000); // let SourceHub + health settle
let t=await p.evaluate(()=>document.body.innerText);
console.log('HAS_Connector_Health:', t.includes('Connector Health'));
console.log('HAS_pipes_or_stages:', /pipe|stage/i.test(t));
console.log('HAS_connected_count:', /connected/i.test(t));
console.log('HAS_No_connectors_monitored:', t.includes('No connectors are being monitored'));
console.log('HAS_Choose_Platform:', t.includes('Choose Your Data Platform'));
console.log('HAS_Active_conn_section:', /Active\b/.test(t));
console.log('HAS_failed_load_strip:', t.includes('Connector health unavailable'));
// Refresh button enabled now?
const refreshBtns=await p.$$('button');
let refState=[];
for(const rb of refreshBtns){const txt=(await rb.innerText().catch(()=>'')).trim(); if(/Refresh/i.test(txt)) refState.push({txt:txt.slice(0,20),dis:await rb.isDisabled().catch(()=>null)});}
console.log('REFRESH_BTNS:',JSON.stringify(refState));
// view toggles Cards/Table/Tree/Map
for(const v of ['Table','Tree','Map','Cards']){
  try{ const loc=p.locator(`button[title="${v}"]`).first(); if(await loc.count()){await loc.click({timeout:3000}); await p.waitForTimeout(800); console.log('VIEW_CLICK_'+v+':ok');} else console.log('VIEW_'+v+':not found');}catch(e){console.log('VIEW_'+v+':err '+e.message.slice(0,60));}
}
// click a source card (Snowflake) -> should show form, no destructive call
try{
  const card=p.locator('text=Cloud data platform for data warehousing').first();
  if(await card.count()){await card.click({timeout:3000}); await p.waitForTimeout(1500);
    const t2=await p.evaluate(()=>document.body.innerText);
    console.log('SNOWFLAKE_FORM_SHOWN:', t2.includes('Username')||t2.includes('Account')||t2.includes('datalake')||t2.includes('Connect'));
  } else console.log('snowflake card not found');
}catch(e){console.log('card err:',e.message.slice(0,80));}
await b.close();
console.log('NET>=400 ('+netErrs.length+'):',JSON.stringify([...new Set(netErrs)]));
console.log('CE ('+ce.length+'):',JSON.stringify([...new Set(ce)].slice(0,6)));
