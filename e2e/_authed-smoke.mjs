import { chromium } from '@playwright/test';
const BASE='http://localhost:3000';
const ROUTES=['/account-overview','/administration','/admin/api-health','/governance/security-matrix','/governance/policies','/data-products'];
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state.json'});
for(const r of ROUTES){
  const p=await ctx.newPage(); const errs=[];
  p.on('response',x=>{if(x.status()>=500)errs.push(x.status()+' '+x.url().replace(BASE,'').slice(0,50));});
  await p.goto(`${BASE}${r}`,{waitUntil:'domcontentloaded'}).catch(()=>{});
  await p.waitForTimeout(6000);
  const url=p.url().replace(BASE,'');
  const authed=!url.includes('/signin');
  const warming=await p.getByText(/warming up|cache is initializing/i).count().catch(()=>0);
  const buttons=await p.locator('button').count().catch(()=>0);
  const tables=await p.locator('table tr, [role="row"]').count().catch(()=>0);
  console.log(`${r.padEnd(30)} authed=${authed} warming=${warming} buttons=${buttons} rows=${tables} 5xx=${errs.length}`);
  await p.close();
}
await b.close();
