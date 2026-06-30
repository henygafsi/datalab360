import { chromium } from '@playwright/test';
const BASE='http://localhost:3000', AUTH='e2e/.auth/state-minted.json';
const gov={};
const browser=await chromium.launch();
const ctx=await browser.newContext({storageState:AUTH, viewport:{width:1500,height:1000}});
const page=await ctx.newPage(); page.setDefaultTimeout(5000);
page.on('response',r=>{const u=r.url();if(/policies\/dmf|dmf\/suggest|run-check/.test(u)){gov[r.request().method()+' '+u.replace(BASE,'').split('?')[0]]=r.status();}});
await page.goto(`${BASE}/data-quality`,{waitUntil:'domcontentloaded'});
for(let i=0;i<35;i++){const h=await page.locator('h1').first().textContent().catch(()=>'')||'';if(/Data Quality/i.test(h))break;await page.waitForTimeout(1000);}
await page.waitForTimeout(3000);
// Open Custom DMF panel -> triggers loadDmfDefs(listDmfs)
try{await page.getByRole('button',{name:'Custom DMF',exact:true}).first().click();await page.waitForTimeout(2500);
  const panelText=await page.locator('[role=dialog], aside, .fixed').filter({hasText:/Custom|DMF/i}).first().innerText().catch(()=>'');
  console.log('CustomPanel open, snippet:',JSON.stringify(panelText.slice(0,120)));
}catch(e){console.log('Custom DMF click err',e.message.slice(0,60));}
// Close with Escape
await page.keyboard.press('Escape').catch(()=>{});
await page.waitForTimeout(800);
// Open Run Check panel (threshold) - read-only until submit
try{await page.getByRole('button',{name:'Run Check',exact:true}).first().click();await page.waitForTimeout(1500);
  const t=await page.locator('.fixed, [role=dialog], aside').filter({hasText:/check|threshold|table/i}).first().innerText().catch(()=>'');
  console.log('RunCheckPanel snippet:',JSON.stringify(t.slice(0,120)));
}catch(e){console.log('Run Check err',e.message.slice(0,60));}
console.log('--- GOV/DMF NETWORK ---');
for(const [k,v] of Object.entries(gov)) console.log(`${v}  ${k}`);
await browser.close(); process.exit(0);
