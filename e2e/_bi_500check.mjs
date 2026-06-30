import { chromium } from '@playwright/test';
const ROOT='/Users/datalab360/Documents/data360_pro/datalab360Front';
const browser=await chromium.launch();
const ctx=await browser.newContext({storageState:ROOT+'/e2e/.auth/state.json'});
const page=await ctx.newPage();
const fails=[];
page.on('response',async r=>{if(r.status()>=500){let b='';try{b=(await r.text()).slice(0,300);}catch{}fails.push({s:r.status(),u:r.url(),rt:r.request().resourceType(),body:b});}});
for(const id of ['proj_f5ba1dffb392','proj_88abbc7e86e1']){
  await page.goto('http://localhost:3000/bi-dashboard/'+id,{waitUntil:'networkidle',timeout:90000}).catch(()=>{});
  await page.waitForTimeout(4000);
}
console.log(JSON.stringify(fails,null,1));
await browser.close();
