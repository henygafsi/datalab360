import { chromium } from '@playwright/test';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state.json'});
const routes=['/account-overview','/intelligent','/administration','/observability','/data-quality'];
for(const route of routes){
  const pg=await ctx.newPage();
  let status='?';
  pg.on('response',r=>{ if(r.url().endsWith(route)) status=r.status(); });
  await pg.goto('http://localhost:3000'+route,{waitUntil:'domcontentloaded',timeout:90000}).catch(()=>{});
  let txt='';
  for(let i=0;i<14;i++){ await pg.waitForTimeout(3000); txt=await pg.evaluate(()=>document.body?document.body.innerText:''); if(txt.length>80) break; }
  const notfound=txt.includes('Page not found');
  console.log(`${route}  http=${status}  len=${txt.length}  notFound=${notfound}  head="${txt.slice(0,60).replace(/\n/g,' ')}"`);
  await pg.close();
}
await b.close();
