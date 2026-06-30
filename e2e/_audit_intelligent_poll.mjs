import { chromium } from '@playwright/test';
const dir='docs/product-readiness-audit/screens/module-green';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state.json'});
const pg=await ctx.newPage();
const bad=[];
pg.on('response',r=>{ if(r.status()>=400) bad.push(`${r.status()} ${r.url().replace('http://localhost:3000','')}`); });
await pg.goto('http://localhost:3000/intelligent',{waitUntil:'domcontentloaded',timeout:90000}).catch(e=>console.log('goto',e.message));
let txt='';
for(let i=0;i<20;i++){
  await pg.waitForTimeout(3000);
  txt=await pg.evaluate(()=>document.body?document.body.innerText:'');
  if(txt.length>80){ console.log(`populated at ~${(i+1)*3}s len=${txt.length}`); break; }
}
console.log('final len',txt.length,'url',pg.url());
console.log('--- text head ---\n'+txt.slice(0,2200));
await pg.screenshot({path:`${dir}/intelligent.png`,fullPage:true});
console.log('--- bad ---\n'+[...new Set(bad)].slice(0,12).join('\n'));
// baseline light route
const pg2=await ctx.newPage();
await pg2.goto('http://localhost:3000/administration',{waitUntil:'domcontentloaded',timeout:90000}).catch(e=>console.log('goto2',e.message));
let t2='';
for(let i=0;i<10;i++){ await pg2.waitForTimeout(3000); t2=await pg2.evaluate(()=>document.body?document.body.innerText:''); if(t2.length>80) break; }
console.log('baseline administration len',t2.length,'url',pg2.url());
await b.close();
