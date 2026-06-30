import { chromium } from '@playwright/test';
import path from 'path'; import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE='http://localhost:3000';
const AUTH=path.join(__dirname,'.auth/state-minted.json');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const net=[];
const b=await chromium.launch({headless:true});
const ctx=await b.newContext({storageState:AUTH,viewport:{width:1600,height:1000}});
const p=await ctx.newPage();
p.on('response',r=>{const u=r.url();if(/\/workflow|\/projects\//.test(u)){const m=u.match(/\/(workflow|projects)\/.*/)||u.match(/\/(workflow|projects).*/);net.push(r.status()+' '+r.request().method()+' '+(m?m[0]:u).split('?')[0]);}});
await p.goto(`${BASE}/workflow`,{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
for(let i=0;i<28;i++){await sleep(2000);if(await p.locator('text=Choose a workflow project').count())break;}
console.log('--- gate loaded, network so far ---');[...new Set(net)].forEach(x=>console.log(' ',x));
net.length=0;
await p.locator('ul[role="listbox"] button').filter({hasText:/SEED_WF_GOV_SCORE/i}).first().click({timeout:5000}).catch(()=>{});
for(let i=0;i<28;i++){await sleep(2000);if(await p.locator('.react-flow').count())break;}
await sleep(8000);
// click through all tabs to force any lazy fetch
for(const name of ['Run history','Cost','Governance','Deployments & versions','Compiled SQL','Usage','Submit for validation','Schedule']){
  const t=p.getByRole('button',{name,exact:true}).first();
  if(await t.count())await t.click({timeout:3000}).catch(()=>{});
  await sleep(2500);
}
console.log('\n--- after select + all tabs: workflow/projects calls ---');
const seen=[...new Set(net)];
seen.forEach(x=>console.log(' ',x));
const bad=net.filter(x=>/^[45]\d\d/.test(x));
console.log('\n4xx/5xx among them:',[...new Set(bad)].join(' | ')||'NONE');
await ctx.close();await b.close();
