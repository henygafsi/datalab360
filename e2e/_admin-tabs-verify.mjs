import { chromium } from '@playwright/test';
import fs from 'fs';
const BASE='http://localhost:3000', SS='docs/product-readiness-audit/screens/admin-green';
fs.mkdirSync(SS,{recursive:true});
const TABS=['health','performance','access','costGov','projects','featureGov','apiHealth','serverMetrics','config'];
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state.json',viewport:{width:1600,height:1000}});
const p=await ctx.newPage();
const out=[];
for(const t of TABS){
  const errs=[],fivexx=[];
  const onc=m=>{if(m.type()==='error')errs.push(m.text().slice(0,80));};
  const onr=r=>{if(r.status()>=500)fivexx.push(r.status()+' '+r.url().replace(BASE,'').split('?')[0]);};
  p.on('console',onc); p.on('response',onr);
  await p.goto(`${BASE}/administration?tab=${t}`,{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});
  await p.waitForTimeout(5500);
  const body=(await p.locator('body').innerText().catch(()=>'')).replace(/\s+/g,' ').trim();
  const notFound=/Page not found|doesn.t exist/.test(body);
  const empty=body.length<300;
  const couldNotLoad=/Could not load|failed to load|CACHE_NOT_READY/i.test(body);
  await p.screenshot({path:`${SS}/tab_${t}.png`,fullPage:false});
  out.push({tab:t, len:body.length, ok: !notFound&&!empty&&!couldNotLoad&&fivexx.length===0, notFound, empty, couldNotLoad, fivexx:fivexx.length, errs:errs.length});
  p.off('console',onc); p.off('response',onr);
}
console.log('TAB'.padEnd(14),'OK','LEN'.padStart(6),'5xx','notes');
for(const r of out) console.log(r.tab.padEnd(14), r.ok?'✅':'❌', String(r.len).padStart(6), String(r.fivexx).padStart(3), [r.notFound&&'NOTFOUND',r.empty&&'EMPTY',r.couldNotLoad&&'LOADERR',r.errs&&`${r.errs}cerr`].filter(Boolean).join(' '));
await b.close();
