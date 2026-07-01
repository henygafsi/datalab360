import { chromium } from '@playwright/test';
const BASE='http://localhost:3000';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state-minted.json',viewport:{width:1750,height:1000}});
const p=await ctx.newPage();
await p.goto(`${BASE}/administration?tab=apiHealth`,{waitUntil:'domcontentloaded',timeout:120000}).catch(e=>console.log('nav',e.message));
let ok=false;
for(let i=0;i<20;i++){await p.waitForTimeout(2500);const t=await p.locator('body').innerText().catch(()=>'');if(t.includes('API Catalog')){ok=true;break;}if(/Sign in to continue/.test(t)){console.log('signin');break;}}
await p.waitForTimeout(4000);
const body=(await p.locator('body').innerText().catch(()=>'')).replace(/\s+/g,' ');
console.log('rendered:',ok,'| Cache+Invalidation cols:',body.includes('Invalidation'),'| KPIs:',(body.match(/\d+ Wired/)||[])[0],(body.match(/\d+ Cached/)||[])[0]);
console.log('labels:',['per-query','per-role','shared','session','realtime'].filter(s=>body.includes(s)).join(','),'| ms shown:',/\d+ms/.test(body));
await p.screenshot({path:'docs/product-readiness-audit/screens/admin-green/api_catalog_kpis.png',fullPage:false});
await b.close();
