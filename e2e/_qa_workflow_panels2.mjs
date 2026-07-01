import { chromium } from '@playwright/test';
import path from 'path'; import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE='http://localhost:3000';
const AUTH=path.join(__dirname,'.auth/state-minted.json');
const SHOT='docs/product-readiness-audit/screens/qa/workflow';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let net=[];
const b=await chromium.launch({headless:true});
const ctx=await b.newContext({storageState:AUTH,viewport:{width:1600,height:1000}});
const p=await ctx.newPage();
p.on('response',r=>{const s=r.status();const u=r.url();if(/localhost:8000|\/api\//.test(u)&&!/\.(png|svg|js|css|woff)/.test(u)){net.push(s+' '+u.replace(/^https?:\/\/[^/]+/,'').split('?')[0]);}});
await p.goto(`${BASE}/workflow`,{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
for(let i=0;i<28;i++){await sleep(2000);if(await p.locator('text=Choose a workflow project').count())break;}
const seed=p.locator('ul[role="listbox"] button').filter({hasText:/SEED_WF_GOV_SCORE/i}).first();
await seed.click({timeout:5000}).catch(e=>console.log('err',e.message));
for(let i=0;i<28;i++){await sleep(2000);if(await p.locator('.react-flow').count())break;}
await sleep(7000);
console.log('nodes:',await p.locator('.react-flow__node').count());

async function clickTab(name){
  net=[];
  const t=p.getByRole('button',{name,exact:true}).first();
  if(await t.count()===0){console.log(`\n## ${name}: NOT FOUND`);return;}
  await t.click({timeout:4000}).catch(e=>console.log('clickerr',name,e.message));
  await sleep(3000);
  return [...new Set(net)];
}
// capture the scrollable panel region text after each click
async function panelText(){
  // smart panel is the right column; grab full body and slice distinctive part
  const t=(await p.locator('body').innerText().catch(()=>'')).replace(/\s+/g,' ');
  return t;
}
for(const name of ['Changes','Submit for validation','Deployments & versions','Results','Run history','Usage','Cost','Governance','Compiled SQL','Schedule']){
  const calls=await clickTab(name);
  if(calls===undefined)continue;
  const t=await panelText();
  const sig=[];
  for(const s of ['coming soon','not deployed','Backend gap','not available yet','Failed to load','No runs','No cost data','No scores','No version','No deployment','No results','succeeded','failed','credits','attributed','Compiled SQL','SELECT','cron','No data','Nothing to']){
    if(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i').test(t))sig.push(s);
  }
  console.log(`\n## ${name}`);
  console.log('   net:',calls.join(' | ')||'(none)');
  console.log('   signals:',[...new Set(sig)].join(', ')||'(none)');
}
await p.screenshot({path:`${SHOT}-4-seed-panels.png`,fullPage:false});
console.log('\nDONE');
await ctx.close();await b.close();
