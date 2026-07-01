import { chromium } from '@playwright/test';
const BASE='http://localhost:3000', SH='docs/product-readiness-audit/screens';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state.json',viewport:{width:1600,height:1000}});
const p=await ctx.newPage();
const out=[];
for(const [name,url] of [['admin_platform_health','/administration'],['admin_api_health','/admin/api-health']]){
  await p.goto(`${BASE}${url}`,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(7000);
  const warming=await p.getByText(/warming up|cache is initializing/i).count().catch(()=>0);
  const red=await p.getByText(/CACHE_NOT_READY|svc_connect_failed|Could not load/i).count().catch(()=>0);
  await p.screenshot({path:`${SH}/${name}.png`});
  out.push(`${name}: warming=${warming} cacheErr=${red} -> ${SH}/${name}.png`);
}
console.log(out.join('\n'));
await b.close();
