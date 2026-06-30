import { chromium } from '@playwright/test';
const dir='docs/product-readiness-audit/screens/module-green';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state.json'});
const pg=await ctx.newPage();
const errs=[];
pg.on('response',async r=>{ if(r.status()>=500){ let bd='';try{bd=(await r.text()).slice(0,200);}catch{} errs.push(`${r.status()} ${r.url().replace('http://localhost:3000','')} :: ${bd.replace(/\s+/g,' ')}`);} });
await pg.goto('http://localhost:3000/intelligent',{waitUntil:'networkidle',timeout:90000}).catch(e=>console.log('goto',e.message));
await pg.waitForTimeout(12000);
// main content area = everything minus the nav
const full=await pg.evaluate(()=>document.body?document.body.innerText:'');
const main=await pg.evaluate(()=>{ const m=document.querySelector('main'); return m?m.innerText:'NO_MAIN'; });
console.log('URL',pg.url(),'fullLen',full.length);
console.log('--- MAIN content ---\n'+main.slice(0,2500));
await pg.screenshot({path:`${dir}/intelligent.png`,fullPage:true});
console.log('--- 5xx ('+errs.length+') ---\n'+[...new Set(errs)].slice(0,10).join('\n'));
await b.close();
