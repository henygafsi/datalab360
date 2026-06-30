import { chromium } from '@playwright/test';
const BASE='http://localhost:3000';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state.json'});
for (const route of ['/account-overview','/data-source-connection']) {
  const p=await ctx.newPage();
  const f404=[], connect=[];
  p.on('response',x=>{const u=x.url();const s=x.status(); if(s>=400 && (u.includes('/_next/')||u.endsWith('.js'))) f404.push(s+' '+u.slice(-50)); if(u.includes('/connect/')||u.includes('source-catalog')||u.includes('common/databases'))connect.push(s+' '+(u.match(/(connect\/[^?]*|source-catalog|common\/databases)/)||[''])[0]);});
  await p.goto(`${BASE}${route}`,{waitUntil:'domcontentloaded'}).catch(()=>{});
  await p.waitForTimeout(10000);
  const bl=await p.evaluate(()=>document.body.innerText.length);
  console.log(route,'bodyLen',bl,'chunk4xx',f404.length, JSON.stringify(f404.slice(0,4)));
  console.log('  connectCalls',JSON.stringify([...new Set(connect)]));
  await p.close();
}
await b.close();
