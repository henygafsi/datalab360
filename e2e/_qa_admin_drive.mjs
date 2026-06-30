import { chromium } from '@playwright/test';
import fs from 'fs';

const STATE = '/Users/datalab360/Documents/data360_pro/datalab360Front/e2e/.auth/state-minted.json';
const OUT = '/Users/datalab360/Documents/data360_pro/datalab360Front/docs/product-readiness-audit/screens/qa';
fs.mkdirSync(OUT, { recursive: true });
const TABS = ['health','performance','access','costGov','projects','featureGov','apiHealth','serverMetrics','config'];

const consoleErrors = [];
const netErrors = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STATE, viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
page.on('console', m => { if (m.type()==='error') consoleErrors.push(m.text().slice(0,300)); });
page.on('response', r => { if (r.status()>=400) netErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`); });

async function waitReal(p){
  for(let i=0;i<25;i++){
    const txt = await page.evaluate(()=>document.body.innerText).catch(()=>'')
    if(txt && txt.includes('Administration') && !/Sign in|signin/i.test(txt)) return txt;
    await page.waitForTimeout(2000);
  }
  return await page.evaluate(()=>document.body.innerText).catch(()=>'');
}

const results = {};
for(const t of TABS){
  consoleErrors.length=0; netErrors.length=0;
  await page.goto(`http://localhost:3000/administration?tab=${t}`, { waitUntil:'domcontentloaded', timeout:60000 });
  const txt = await waitReal(t);
  await page.waitForTimeout(3500); // let panels fetch
  const txt2 = await page.evaluate(()=>document.body.innerText).catch(()=>'');
  await page.screenshot({ path: `${OUT}/administration-${t}.png`, fullPage:true });
  results[t] = {
    len: txt2.length,
    sample: txt2.replace(/\s+/g,' ').slice(0,600),
    consoleErrors: [...consoleErrors],
    netErrors: [...new Set(netErrors)],
  };
  console.log(`\n===== TAB ${t} (len=${txt2.length}) =====`);
  console.log('SAMPLE:', results[t].sample);
  console.log('CONSOLE_ERR:', JSON.stringify(results[t].consoleErrors));
  console.log('NET_ERR:', JSON.stringify(results[t].netErrors));
}
fs.writeFileSync(`${OUT}/_admin_results.json`, JSON.stringify(results,null,2));
await browser.close();
console.log('\nDONE');
