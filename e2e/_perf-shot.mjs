import { chromium } from '@playwright/test';
const BASE='http://localhost:3000';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state-minted.json',viewport:{width:1750,height:1050}});
const p=await ctx.newPage();
await p.goto(`${BASE}/administration?tab=performance`,{waitUntil:'domcontentloaded',timeout:120000}).catch(e=>console.log('nav',e.message));
let ok=false;
for(let i=0;i<22;i++){await p.waitForTimeout(2500);const t=await p.locator('body').innerText().catch(()=>'');if(/Per-endpoint KPIs|Total requests/.test(t)){ok=true;break;}if(/Sign in to continue/.test(t)){console.log('signin');break;}}
await p.waitForTimeout(3000);
const body=(await p.locator('body').innerText().catch(()=>'')).replace(/\s+/g,' ');
console.log('rendered KPIs:',ok);
console.log('headline KPIs:',['Total requests','Error rate','p50 latency','p99 latency'].filter(s=>body.includes(s)).join(','));
console.log('per-endpoint table:',body.includes('Per-endpoint KPIs'),'| has Requests/Errors cols:',body.includes('Requests')&&body.includes('Errors'));
console.log('real numbers present:',/\d{2,}/.test(body));
await p.screenshot({path:'docs/product-readiness-audit/screens/admin-green/perf_kpis.png',fullPage:false});
await b.close();
