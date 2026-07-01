import { chromium } from '@playwright/test';
import { resolve } from 'path';
const BASE='http://localhost:3000';
const AUTH=resolve('e2e/.auth/state-minted.json');
const TABS=['overview','dwh-plan','snowflake-objects','finops','modules','platform-activity','projects','security','organization'];
const SHOT='docs/product-readiness-audit/screens/qa/account-overview.png';
const out={tabs:{},console:[],net4xx5xx:[]};
const browser=await chromium.launch();
const ctx=await browser.newContext({storageState:AUTH,viewport:{width:1440,height:1000}});
const page=await ctx.newPage();
page.on('console',m=>{if(m.type()==='error')out.console.push(m.text().slice(0,300));});
page.on('response',r=>{const s=r.status();if(s>=400){const u=r.url();if(u.includes('/api/')||u.includes(':8000'))out.net4xx5xx.push(`[${s}] ${r.request().method()} ${u.replace(BASE,'')}`);}});
for(const t of TABS){
  const url=t==='overview'?`${BASE}/account-overview`:`${BASE}/account-overview?tab=${t}`;
  let txt='',ok=false;
  try{
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
    for(let i=0;i<25;i++){
      await page.waitForTimeout(2000);
      txt=await page.evaluate(()=>document.body.innerText).catch(()=>'');
      if(txt && txt.length>200 && !/redirecting|sign in|loading\.\.\./i.test(txt.slice(0,80))){ok=true;break;}
    }
  }catch(e){txt='ERR:'+e.message;}
  // count buttons
  const btns=await page.evaluate(()=>{
    const set=new Set();
    document.querySelectorAll('button, [role=tab], a[role=button]').forEach(b=>{const t=(b.innerText||b.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ');if(t)set.add(t.slice(0,40));});
    return [...set];
  }).catch(()=>[]);
  out.tabs[t]={ok,len:txt.length,sample:txt.slice(0,600).replace(/\n+/g,' | '),buttons:btns};
  if(t==='overview')await page.screenshot({path:SHOT,fullPage:true}).catch(()=>{});
}
await browser.close();
console.log(JSON.stringify(out,null,1));
