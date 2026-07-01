import { chromium } from '@playwright/test';
const AUTH='/Users/datalab360/Documents/data360_pro/datalab360Front/e2e/.auth/state-minted.json';
const SHOT='/Users/datalab360/Documents/data360_pro/datalab360Front/docs/product-readiness-audit/screens/qa/mapping.png';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch();
const ctx=await b.newContext({storageState:AUTH});
const p=await ctx.newPage();
const consoleErrors=[], net4xx=[];
p.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
p.on('response',r=>{if(r.status()>=400)net4xx.push(r.status()+' '+r.url());});
const urls=[];
p.on('framenavigated',f=>{if(f===p.mainFrame())urls.push(f.url());});
await p.goto('http://localhost:3000/mapping',{waitUntil:'domcontentloaded',timeout:60000});
// poll for redirect / content
let finalUrl='', bodyText='';
for(let i=0;i<25;i++){
  await sleep(2000);
  finalUrl=p.url();
  bodyText=await p.locator('body').innerText().catch(()=>'');
  if(finalUrl.includes('/explore-design') && bodyText.length>200 && !/Mapping has moved/.test(bodyText)) break;
}
await sleep(2000);
finalUrl=p.url();
bodyText=await p.locator('body').innerText().catch(()=>'');
await p.screenshot({path:SHOT,fullPage:false}).catch(e=>console.log('shot err',e.message));
console.log('NAV CHAIN:', JSON.stringify(urls.slice(0,8)));
console.log('FINAL URL:', finalUrl);
console.log('SIGNIN?', /sign\s?in|log\s?in/i.test(bodyText) && finalUrl.includes('signin'));
console.log('BODY LEN:', bodyText.length);
console.log('BODY HEAD:', bodyText.slice(0,500).replace(/\n+/g,' | '));
console.log('CONSOLE ERRORS:', consoleErrors.length, JSON.stringify(consoleErrors.slice(0,8)));
console.log('NET >=400:', net4xx.length, JSON.stringify(net4xx.slice(0,15)));
await b.close();
