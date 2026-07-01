import { chromium } from '@playwright/test';
const BASE='http://localhost:3000';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'/Users/datalab360/Documents/data360_pro/datalab360Front/e2e/.auth/state-minted.json',viewport:{width:1750,height:1050}});
const p=await ctx.newPage();
await p.goto(`${BASE}/administration?tab=health`,{waitUntil:'domcontentloaded',timeout:120000}).catch(e=>console.log('nav',e.message));
let ok=false;
for(let i=0;i<22;i++){await p.waitForTimeout(2500);const t=await p.locator('body').innerText().catch(()=>'');if(/Cache hit rate|Service account|SVC registry/.test(t)){ok=true;break;}if(/Sign in to continue/.test(t)){console.log('signin');break;}}
await p.waitForTimeout(3000);
const body=(await p.locator('body').innerText().catch(()=>'')).replace(/\s+/g,' ');
console.log('ServiceHealthPanel rendered:',ok);
console.log('signals:',['Cache hit rate','SVC active queries','Service account','SVC registry','Cache keys by class'].filter(s=>body.includes(s)).join(' | '));
console.log('real values:',/\d+\.\d%|connection alive|alive|ACCOUNTADMIN/.test(body));
await p.screenshot({path:'docs/product-readiness-audit/screens/admin-green/health_svc.png',fullPage:false});
await b.close();
