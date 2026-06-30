import { chromium } from '@playwright/test';
import fs from 'fs';
const dir='docs/product-readiness-audit/screens/module-green';
fs.mkdirSync(dir,{recursive:true});
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state.json'});
const pg=await ctx.newPage();
const errs5xx=[], consoleErrs=[];
pg.on('response',r=>{ if(r.status()>=500) errs5xx.push(`${r.status()} ${r.url()}`); });
pg.on('console',m=>{ if(m.type()==='error') consoleErrs.push(m.text().slice(0,160)); });
await pg.goto('http://localhost:3000/intelligent',{waitUntil:'networkidle',timeout:60000}).catch(e=>console.log('goto',e.message));
await pg.waitForTimeout(6000);
await pg.screenshot({path:`${dir}/intelligent.png`,fullPage:true});
const bodyText=await pg.innerText('body').catch(()=>'');
const badPanels=[];
for(const k of ['Could not load','Failed to load','Error loading','No data','Something went wrong']){
  if(bodyText.includes(k)) badPanels.push(k);
}
// pull a visible KPI number to cross-check
const kpiSnips=(bodyText.match(/[A-Za-z ]{3,30}\n?\s*\d[\d,.]*/g)||[]).slice(0,30);
console.log('=== 5xx ===\n'+(errs5xx.join('\n')||'none'));
console.log('=== consoleErrors ('+consoleErrs.length+') ===\n'+consoleErrs.slice(0,12).join('\n'));
console.log('=== badPanels ===\n'+(badPanels.join(', ')||'none'));
console.log('=== bodyTextLen '+bodyText.length+' ===');
console.log('=== first 1500 chars ===\n'+bodyText.slice(0,1500));
await b.close();
