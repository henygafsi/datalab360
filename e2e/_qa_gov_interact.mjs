import { chromium } from '@playwright/test';
import path from 'path'; import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE = path.join(__dirname, '.auth', 'state-minted.json');
const BASE='http://localhost:3000';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({storageState:STATE,viewport:{width:1500,height:1000}});

async function run(route, tabLabels){
  const page=await ctx.newPage();
  const bad=[];
  page.on('response',resp=>{const s=resp.status();if(s>=400){const u=resp.url();if(!/_next|favicon|hot-update/.test(u))bad.push(`${s} ${resp.request().method()} ${u.replace(BASE,'').split('?')[0]}`);}});
  await page.goto(`${BASE}/governance/${route}`,{waitUntil:'domcontentloaded',timeout:60000});
  await sleep(6000);
  console.log(`\n##### ${route}`);
  for(const lbl of tabLabels){
    try{
      const el=await page.$(`button:has-text("${lbl}")`);
      if(!el){console.log(`  tab "${lbl}": NOT FOUND`);continue;}
      await el.click({timeout:4000}); await sleep(3500);
      const txt=await page.evaluate(()=>document.body.innerText);
      const empty=/no .* (found|yet|configured)|create your first|add first|get started|empty/i.test(txt);
      const tableRows=await page.$$eval('table tbody tr',r=>r.length).catch(()=>0);
      console.log(`  tab "${lbl}": rows=${tableRows} emptyState=${empty} bodyLen=${txt.length}`);
    }catch(e){console.log(`  tab "${lbl}": ERR ${e.message.slice(0,60)}`);}
  }
  if(bad.length)console.log('  NET>=400: '+[...new Set(bad)].join(' ; '));
  else console.log('  NET>=400: none');
  await page.close();
}

await run('policies',['Row Access','Masking','Aggregation','Network','Classification','Tags','Data Metrics','Password','Session']);
await run('grants',['Role Grants','Grant Matrix','User Grants','Policy Grants','Stage Grants','D360 Roles','Sources & Products']);
await run('security-matrix',['Access Matrix','Enterprise Users','Security Axes']);
await browser.close();
console.log('\nDONE');
