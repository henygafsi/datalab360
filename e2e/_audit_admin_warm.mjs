import { chromium } from '@playwright/test';
const BASE='http://localhost:3000';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state.json',viewport:{width:1600,height:1100}});
const p=await ctx.newPage();
const pageErrors=[]; const reqfail=[];
p.on('pageerror',(e)=>pageErrors.push(String(e).slice(0,200)));
p.on('requestfailed',(r)=>reqfail.push(`${r.failure()?.errorText} ${r.url().slice(0,90)}`));
p.on('response',(r)=>{ if(r.status()>=400 && r.url().includes('_next')) reqfail.push(`${r.status()} ${r.url().slice(0,90)}`); });
// warm-up hit to trigger dev compile
await p.goto(`${BASE}/administration`,{waitUntil:'domcontentloaded'}).catch(()=>{});
await p.waitForTimeout(20000); // let dev compile
await p.reload({waitUntil:'networkidle'}).catch(()=>{});
await p.waitForTimeout(8000);
const txt = await p.evaluate(()=> document.querySelector('h1')?.innerText || '(no h1)');
const tabCount = await p.locator('[role=tab]').count().catch(()=>0);
const hasHub = await p.getByText(/One place for platform administration/i).count().catch(()=>0);
console.log('URL:', p.url());
console.log('h1:', txt, '| role=tab count:', tabCount, '| hub intro present:', hasHub);
console.log('pageErrors:', JSON.stringify([...new Set(pageErrors)].slice(0,5)));
console.log('next reqfail:', JSON.stringify([...new Set(reqfail)].slice(0,8)));
await p.screenshot({path:'docs/product-readiness-audit/screens/admin-green/admin-warm-recheck.png',fullPage:true});
await b.close();
