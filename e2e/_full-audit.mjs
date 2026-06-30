import { chromium } from '@playwright/test';
import fs from 'node:fs';
const BASE='http://localhost:3000';
const MOD={
 'account-overview':['/account-overview'],
 'sources':['/sources','/data-source-connection'],
 'explore-design':['/explore-design'],
 'bi-dashboard':['/bi-dashboard'],
 'workflow':['/workflow'],
 'governance':['/governance/policies','/governance/roles','/governance/users','/governance/grants','/governance/security-matrix','/governance/oauth'],
 'data-quality':['/data-quality'],
 'observability':['/observability','/observability/lineage','/observability/slo','/observability/budget','/observability/alerts'],
 'intelligent':['/intelligent'],
 'administration':['/administration','/admin/api-health','/admin/data360-config','/admin/platform-settings'],
 'data-products':['/data-products'],
 'mapping':['/mapping'],
};
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state.json',viewport:{width:1440,height:900}});
const out={};
for(const [mod,routes] of Object.entries(MOD)){
 const m={routes:[],tabs:[],dupTabs:[],emptyTabs:[],warming:0,errors:0,signin:0};
 for(const r of routes){
  const p=await ctx.newPage();
  p.on('response',x=>{if(x.status()>=500)m.errors++;});
  try{
   await p.goto(`${BASE}${r}`,{waitUntil:'domcontentloaded',timeout:25000});
   await p.waitForTimeout(3500);
   if(p.url().includes('/signin')){m.signin++;m.routes.push({r,signin:true});await p.close();continue;}
   const warming=await p.getByText(/warming up|cache is initializing/i).count().catch(()=>0);
   if(warming)m.warming++;
   const buttons=await p.locator('button:visible').count().catch(()=>0);
   // tab discovery: role=tab, or pill buttons in a horizontal bar
   let tabEls=await p.locator('[role="tab"]').all().catch(()=>[]);
   if(tabEls.length===0){ // fallback: buttons that look like tabs (siblings in a flex row near top)
     tabEls=await p.locator('nav button, .border-b button, [class*="tab" i] button').all().catch(()=>[]);
   }
   const labels=[];
   for(const t of tabEls.slice(0,20)){ const tx=(await t.innerText().catch(()=>'')).trim(); if(tx&&tx.length<40)labels.push(tx); }
   const seen={}; const dups=[];
   for(const l of labels){ seen[l]=(seen[l]||0)+1; if(seen[l]===2)dups.push(l); }
   m.routes.push({r,warming,buttons,tabCount:labels.length});
   if(dups.length)m.dupTabs.push({r,dups});
   // click through up to 8 tabs, detect empty / button-only content
   for(let i=0;i<Math.min(tabEls.length,8);i++){
    try{
     const t=tabEls[i]; const lbl=(await t.innerText().catch(()=>'')).trim().slice(0,30);
     if(!lbl)continue;
     await t.click({timeout:3000}); await p.waitForTimeout(1200);
     const rows=await p.locator('table tr, [role="row"]').count().catch(()=>0);
     const cards=await p.locator('[class*="card" i], [class*="grid" i] > div').count().catch(()=>0);
     const btns=await p.locator('button:visible').count().catch(()=>0);
     const txt=(await p.locator('main, [role="main"], body').first().innerText().catch(()=>'')).replace(/\s+/g,' ').trim();
     const empty = rows===0 && cards<2 && txt.length<160;
     const buttonOnly = btns>0 && rows===0 && cards<2 && txt.replace(/[A-Za-z]/g,'').length>txt.length*0.3;
     if(empty||buttonOnly) m.emptyTabs.push(`${r} :: "${lbl}" (rows=${rows} cards=${cards} btns=${btns} txt=${txt.length})`);
    }catch{}
   }
  }catch(e){m.routes.push({r,err:String(e).slice(0,60)});}
  await p.close();
 }
 out[mod]=m;
 const e=m.emptyTabs.length,d=m.dupTabs.length;
 console.log(`${mod.padEnd(18)} routes=${routes.length} signin=${m.signin} warming=${m.warming} 5xx=${m.errors} dupTabs=${d} emptyTabs=${e}`);
}
fs.writeFileSync('/tmp/full-audit.json',JSON.stringify(out,null,2));
console.log('\nWROTE /tmp/full-audit.json');
await b.close();
