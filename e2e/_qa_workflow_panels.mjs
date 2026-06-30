import { chromium } from '@playwright/test';
import path from 'path'; import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE='http://localhost:3000';
const AUTH=path.join(__dirname,'.auth/state-minted.json');
const SHOT='docs/product-readiness-audit/screens/qa/workflow';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const net=[];
const b=await chromium.launch({headless:true});
const ctx=await b.newContext({storageState:AUTH,viewport:{width:1600,height:1000}});
const p=await ctx.newPage();
p.on('response',r=>{const s=r.status();const u=r.url();if(/\/workflow|\/projects/.test(u)&&!/\.(png|svg|js|css)/.test(u)){net.push(s+' '+r.request().method()+' '+u.replace(BASE,'').replace(/^.*\/api/,'').split('?')[0]);}});
await p.goto(`${BASE}/workflow`,{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
for(let i=0;i<28;i++){await sleep(2000);if(await p.locator('text=Choose a workflow project').count())break;}
// pick a SEED workflow (real data)
const seed=p.locator('ul[role="listbox"] button').filter({hasText:/SEED_WF/i}).first();
let pick=seed;
if(await seed.count()===0)pick=p.locator('ul[role="listbox"] button').first();
const pname=(await pick.innerText().catch(()=>'')).replace(/\s+/g,' ').slice(0,45);
console.log('selecting:',pname);
await pick.click({timeout:5000}).catch(e=>console.log('err',e.message));
for(let i=0;i<28;i++){await sleep(2000);if(await p.locator('.react-flow').count())break;}
await sleep(6000);
const nodes=await p.locator('.react-flow__node').count();
console.log('nodes on canvas:',nodes);

// click each read-only rail tab, capture panel text + which network fired
const tabs=['Run history','Cost','Governance','Deployments & versions','Compiled SQL','Usage','Results','Submit for validation','Changes','Schedule'];
for(const name of tabs){
  net.length=0;
  const loc=p.locator(`button[title*="${name}" i], button:has-text("${name}")`).filter({hasText:''}).first();
  const byTitle=p.locator(`button[title="${name}"]`).first();
  const target=(await byTitle.count())>0?byTitle:p.locator('button').filter({hasText:new RegExp('^'+name+'$','i')}).first();
  if(await target.count()===0){console.log(`\n## ${name}: NOT FOUND`);continue;}
  await target.click({timeout:3000}).catch(()=>{});
  await sleep(2800);
  // capture the right-panel content area text
  const txt=(await p.locator('body').innerText().catch(()=>'')).replace(/\s+/g,' ');
  // extract a window around the tab name region — just dump distinctive panel signals
  const signals=[];
  for(const sig of ['coming soon','not deployed','Backend gap','Failed to load','No runs','No cost','No scores','No versions','No deployments','empty','Error','error','Loading','dry-run','succeeded','failed','credits','cr ','version','Submit for validation','schedule']){
    if(new RegExp(sig.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i').test(txt))signals.push(sig);
  }
  console.log(`\n## ${name} -> net:[${[...new Set(net)].join(', ')||'none'}] signals:[${[...new Set(signals)].join(', ')}]`);
}
await p.screenshot({path:`${SHOT}-4-seed-panels.png`,fullPage:false});
console.log('\nDONE');
await ctx.close();await b.close();
