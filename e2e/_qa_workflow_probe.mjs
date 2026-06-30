import { chromium } from '@playwright/test';
import path from 'path'; import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE='http://localhost:3000';
const AUTH=path.join(__dirname,'.auth/state-minted.json');
const SHOT='docs/product-readiness-audit/screens/qa/workflow';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const errs=[], net=[];
const b=await chromium.launch({headless:true});
const ctx=await b.newContext({storageState:AUTH,viewport:{width:1600,height:1000}});
const p=await ctx.newPage();
p.on('pageerror',e=>errs.push('PAGEERR '+(e.message||e).slice(0,160)));
p.on('console',m=>{if(m.type()==='error'){const t=m.text();if(!/favicon|ERR_|content-security|Download the React/i.test(t))errs.push('CONSOLE '+t.slice(0,160));}});
p.on('response',r=>{const s=r.status();const u=r.url();if(s>=400&&!/\.(png|jpg|svg|woff2?|ico|css|js)(\?|$)/.test(u))net.push(s+' '+r.request().method()+' '+u.replace(BASE,'').split('?')[0]);});

console.log('=== NAV /workflow ===');
await p.goto(`${BASE}/workflow`,{waitUntil:'domcontentloaded',timeout:40000}).catch(e=>console.log('nav',e.message));
// poll for gate content
let body='';
for(let i=0;i<25;i++){await sleep(2000);body=await p.locator('body').innerText().catch(()=>'');if(/Choose a workflow project|workflows? loaded|No workflows/i.test(body)||body.length>400)break;}
console.log('url:',p.url(),'| signin?',p.url().includes('signin'),'| bodyLen:',body.length);
console.log('gate head:',body.replace(/\s+/g,' ').slice(0,260));
await p.screenshot({path:`${SHOT}-1-gate.png`,fullPage:false});

// count workflow option buttons in gate listbox
const opts=await p.locator('ul[role="listbox"] button, li[role="option"] button').all();
console.log('gate project buttons:',opts.length);
let picked=false;
if(opts.length>0){
  const label=(await opts[0].innerText().catch(()=>'')).replace(/\s+/g,' ').slice(0,60);
  console.log('clicking project:',label);
  await opts[0].click({timeout:5000}).catch(e=>console.log('clickerr',e.message));
  picked=true;
  // poll for builder
  for(let i=0;i<25;i++){await sleep(2000);const rf=await p.locator('.react-flow,[class*="react-flow"]').count();if(rf>0)break;}
}
await sleep(6000);
const rf=await p.locator('.react-flow,[class*="react-flow"]').count();
const nodes=await p.locator('.react-flow__node').count();
console.log('reactflow:',rf,'| nodes:',nodes);
const body2=await p.locator('body').innerText().catch(()=>'');
console.log('builder err?',/something went wrong|rendering error/i.test(body2));
await p.screenshot({path:`${SHOT}-2-builder.png`,fullPage:false});

// enumerate visible buttons with title/aria
console.log('\n=== BUTTONS ===');
const btns=await p.locator('button').all();
const rows=[];
for(const bt of btns){
  const vis=await bt.isVisible().catch(()=>false);if(!vis)continue;
  const tx=(await bt.innerText().catch(()=>'')).replace(/\s+/g,' ').trim();
  const ar=await bt.getAttribute('aria-label').catch(()=>'')||'';
  const ti=await bt.getAttribute('title').catch(()=>'')||'';
  const dis=await bt.isDisabled().catch(()=>false);
  const lbl=(tx||ar||ti||'(icon)').slice(0,60);
  rows.push({lbl,ar:ar.slice(0,40),ti:ti.slice(0,50),dis});
}
console.log('visible buttons:',rows.length);
rows.forEach(r=>console.log(`  [${r.dis?'DIS':'EN '}] "${r.lbl}"${r.ti?' ti="'+r.ti+'"':''}`));

// Try opening smart panel rail read-only sections (Runs, Cost, Versions, Governance, Usage)
console.log('\n=== SMART PANEL RAIL (titled buttons) ===');
const rail=await p.locator('button[title]').all();
const railTitles=[];
for(const rb of rail){const t=await rb.getAttribute('title').catch(()=>'');const v=await rb.isVisible().catch(()=>false);if(t&&v)railTitles.push(t);}
console.log('rail/titled:',JSON.stringify([...new Set(railTitles)]));

// click a few safe read-only rail items by title regex
for(const want of [/run/i,/cost/i,/version/i,/governance/i,/schedule/i,/usage/i,/result/i]){
  const el=p.locator('button[title]').filter({has:p.locator('svg')}).filter({hasText:''});
  const t=p.locator('button').filter({hasText:''});
}
// generic: click any titled button matching read-only sections
for(const rx of ['Runs','Run history','Cost','Version','Governance','Schedule','Usage','Results','Changes']){
  const loc=p.locator(`button[title*="${rx}" i]`).first();
  if(await loc.count()>0 && await loc.isVisible().catch(()=>false)){
    await loc.click({timeout:3000}).catch(()=>{});
    await sleep(1500);
    const panelTxt=(await p.locator('body').innerText().catch(()=>'')).replace(/\s+/g,' ');
    const snippet=panelTxt.slice(0,0); // skip
    console.log(`clicked rail "${rx}" -> ok`);
  }
}
await sleep(2000);
await p.screenshot({path:`${SHOT}-3-panel.png`,fullPage:false});
const finalTxt=(await p.locator('body').innerText().catch(()=>'')).replace(/\s+/g,' ');
console.log('\ncoming-soon visible?',/coming soon/i.test(finalTxt));
console.log('backend gap visible?',/Backend gap|isn.t deployed|not available yet/i.test(finalTxt));

console.log('\n=== NET 4xx/5xx ('+net.length+') ===');[...new Set(net)].forEach(x=>console.log('  ',x));
console.log('=== CONSOLE/PAGE ERRORS ('+errs.length+') ===');[...new Set(errs)].slice(0,20).forEach(x=>console.log('  ',x));
await ctx.close();await b.close();
