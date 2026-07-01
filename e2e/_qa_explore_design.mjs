import { chromium } from '@playwright/test';
const BASE='http://localhost:3000';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state-minted.json',viewport:{width:1680,height:1000}});
const p=await ctx.newPage();
const errs=[],net=[];
p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,200));});
p.on('response',r=>{const s=r.status();if(s>=400)net.push(s+' '+r.request().method()+' '+r.url().replace(BASE,'').split('?')[0]);});
await p.goto(`${BASE}/explore-design`,{waitUntil:'domcontentloaded',timeout:60000}).catch(e=>console.log('nav:',e.message));
// poll for real content
let bodyText='';
for(let i=0;i<25;i++){
  bodyText=(await p.locator('body').innerText().catch(()=>'')).replace(/\s+/g,' ').trim();
  if(bodyText.length>600 && !/sign in|loading/i.test(bodyText.slice(0,80))) break;
  await p.waitForTimeout(2000);
}
console.log('final url:', p.url());
console.log('body len:', bodyText.length);
console.log('body head:', bodyText.slice(0,700));
// buttons
const btns=await p.locator('button:visible').allInnerTexts().catch(()=>[]);
const btnClean=[...new Set(btns.map(t=>t.replace(/\s+/g,' ').trim()).filter(Boolean))];
console.log('VISIBLE BUTTONS ('+btnClean.length+'):');
btnClean.forEach(x=>console.log('  •',x.slice(0,60)));
// tabs/role
const tabs=await p.getByRole('tab').allInnerTexts().catch(()=>[]);
console.log('ROLE tabs:', tabs.length,'->',tabs.join(' | ').slice(0,300));
await p.screenshot({path:'docs/product-readiness-audit/screens/qa/explore-design.png',fullPage:false});
console.log('--- 4xx/5xx ('+net.length+') ---'); [...new Set(net)].slice(0,30).forEach(x=>console.log('  ',x));
console.log('--- console errors ('+errs.length+') ---'); [...new Set(errs)].slice(0,20).forEach(x=>console.log('  ',x));
await b.close();
