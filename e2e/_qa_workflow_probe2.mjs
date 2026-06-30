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
p.on('pageerror',e=>errs.push('PAGEERR '+(e.message||e).slice(0,180)));
p.on('console',m=>{if(m.type()==='error'){const t=m.text();if(!/favicon|ERR_|content-security|Download the React/i.test(t))errs.push('CONSOLE '+t.slice(0,180));}});
p.on('response',r=>{const s=r.status();const u=r.url();if(s>=400&&!/\.(png|jpg|svg|woff2?|ico|css|js)(\?|$)/.test(u))net.push(s+' '+r.request().method()+' '+u.replace(BASE,'').split('?')[0]);});

console.log('=== NAV /workflow (patient) ===');
await p.goto(`${BASE}/workflow`,{waitUntil:'domcontentloaded',timeout:40000}).catch(e=>console.log('nav',e.message));
let ok=false;
for(let i=0;i<28;i++){
  await sleep(2000);
  const gate=await p.locator('text=Choose a workflow project').count();
  const rf=await p.locator('.react-flow,[class*="react-flow"]').count();
  const loadingWf=await p.locator('text=Loading workflows').count();
  if(i%3===0)console.log(`  t=${(i+1)*2}s gate=${gate} rf=${rf} loadingWf=${loadingWf}`);
  if(gate>0||rf>0){ok=true;break;}
}
const body=await p.locator('body').innerText().catch(()=>'');
console.log('settled. ok=',ok,'bodyLen=',body.length);
await p.screenshot({path:`${SHOT}-1-gate.png`,fullPage:false});

// gate projects
const opts=await p.locator('ul[role="listbox"] li[role="option"] button, ul[role="listbox"] button').all();
console.log('gate project buttons:',opts.length);
if(opts.length){
  const names=[];for(const o of opts.slice(0,6)){names.push((await o.innerText().catch(()=>'')).replace(/\s+/g,' ').slice(0,40));}
  console.log('projects:',JSON.stringify(names));
  await opts[0].click({timeout:5000}).catch(e=>console.log('clickerr',e.message));
  for(let i=0;i<28;i++){await sleep(2000);const rf=await p.locator('.react-flow,[class*="react-flow"]').count();if(rf>0)break;if(i%4===0)console.log('  waiting builder t='+(i+1)*2+'s rf='+rf);}
}
await sleep(6000);
const rf=await p.locator('.react-flow,[class*="react-flow"]').count();
const nodes=await p.locator('.react-flow__node').count();
console.log('AFTER SELECT reactflow:',rf,'nodes:',nodes);
await p.screenshot({path:`${SHOT}-2-builder.png`,fullPage:false});

console.log('\n=== VISIBLE BUTTONS (post-select) ===');
const btns=await p.locator('button').all();const rows=[];
for(const bt of btns){const vis=await bt.isVisible().catch(()=>false);if(!vis)continue;
  const tx=(await bt.innerText().catch(()=>'')).replace(/\s+/g,' ').trim();
  const ar=await bt.getAttribute('aria-label').catch(()=>'')||'';
  const ti=await bt.getAttribute('title').catch(()=>'')||'';
  const dis=await bt.isDisabled().catch(()=>false);
  rows.push({lbl:(tx||ar||ti||'(icon)').slice(0,55),ti:ti.slice(0,55),dis});}
console.log('count:',rows.length);
rows.forEach(r=>console.log(`  [${r.dis?'DIS':'EN '}] "${r.lbl}"${r.ti&&r.ti!==r.lbl?' ti="'+r.ti+'"':''}`));

// rail titled
const rail=await p.locator('button[title]').all();const rt=[];
for(const rb of rail){const t=await rb.getAttribute('title').catch(()=>'');const v=await rb.isVisible().catch(()=>false);if(t&&v)rt.push(t);}
console.log('\nrail/titled:',JSON.stringify([...new Set(rt)]));

// click read-only rail sections
for(const rx of ['Run','Cost','Version','Governance','Schedule','Usage','Result','Change','SQL','Block']){
  const loc=p.locator(`button[title*="${rx}" i]`).first();
  if(await loc.count()>0 && await loc.isVisible().catch(()=>false)){
    await loc.click({timeout:3000}).catch(()=>{});await sleep(1800);
    console.log(`clicked rail "${rx}"`);
  }
}
await sleep(1500);
await p.screenshot({path:`${SHOT}-3-panel.png`,fullPage:false});
const ft=(await p.locator('body').innerText().catch(()=>'')).replace(/\s+/g,' ');
console.log('coming-soon?',/coming soon/i.test(ft),'| backendGap?',/Backend gap|isn.t deployed|not available yet|not deployed/i.test(ft));

console.log('\n=== NET 4xx/5xx ('+net.length+') ===');[...new Set(net)].forEach(x=>console.log('  ',x));
console.log('=== ERRORS ('+errs.length+') ===');[...new Set(errs)].slice(0,25).forEach(x=>console.log('  ',x));
await ctx.close();await b.close();
