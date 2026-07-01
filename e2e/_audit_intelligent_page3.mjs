import { chromium } from '@playwright/test';
const dir='docs/product-readiness-audit/screens/module-green';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state.json'});
const pg=await ctx.newPage();
const bad=[];
pg.on('response',r=>{ if(r.status()>=400) bad.push(`${r.status()} ${r.url().replace('http://localhost:3000','')}`); });
await pg.goto('http://localhost:3000/intelligent',{waitUntil:'domcontentloaded',timeout:60000}).catch(e=>console.log('goto',e.message));
await pg.waitForTimeout(8000);
let txt=await pg.evaluate(()=>document.body?document.body.innerText:'');
console.log('try1 len',txt.length,'url',pg.url());
if(txt.length<50){
  await pg.reload({waitUntil:'networkidle',timeout:60000}).catch(e=>console.log('reload',e.message));
  await pg.waitForTimeout(8000);
  txt=await pg.evaluate(()=>document.body?document.body.innerText:'');
  console.log('try2 len',txt.length);
}
if(txt.length<50){
  await pg.reload({waitUntil:'networkidle',timeout:60000}).catch(()=>{});
  await pg.waitForTimeout(9000);
  txt=await pg.evaluate(()=>document.body?document.body.innerText:'');
  console.log('try3 len',txt.length);
}
console.log('URL',pg.url());
console.log(txt.slice(0,2000));
await pg.screenshot({path:`${dir}/intelligent.png`,fullPage:true});
console.log('=== >=400 ===\n'+[...new Set(bad)].join('\n'));
await b.close();
