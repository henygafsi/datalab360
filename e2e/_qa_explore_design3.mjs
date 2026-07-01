import { chromium } from '@playwright/test';
const BASE='http://localhost:3000';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state-minted.json',viewport:{width:1680,height:1000}});
const p=await ctx.newPage();
const errs=[],net=[];
p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,160));});
p.on('response',r=>{const s=r.status();if(s>=400)net.push(s+' '+r.request().method()+' '+r.url().replace(BASE,'').split('?')[0]);});
await p.goto(`${BASE}/explore-design`,{waitUntil:'domcontentloaded',timeout:60000}).catch(e=>console.log('nav:',e.message));
await p.waitForTimeout(6000);
// Click a real project card
const card=p.getByRole('button',{name:/SEED_EXP_RLS_MODEL/i}).first();
console.log('card found?', await card.count());
await card.click().catch(e=>console.log('card click err',e.message));
await p.waitForTimeout(2000);
// Maybe a confirm "Open" appears
const ob=p.getByRole('button',{name:/^Open project$|^Open$|Continue/i}).first();
if(await ob.count().catch(()=>0)){ console.log('clicking open confirm'); await ob.click().catch(()=>{}); }
// wait for catalog (tables) to load
await p.waitForTimeout(9000);
let bt=(await p.locator('body').innerText().catch(()=>'')).replace(/\s+/g,' ').trim();
console.log('LOADED body[150:1100]:', bt.slice(150,1100));
const tabsDisabled=await p.$$eval('button',bs=>bs.filter(x=>/^(AI Model|Deploy|Modeling|Catalog)$/.test(x.textContent.trim())).map(x=>x.textContent.trim()+(x.disabled?':DISABLED':':enabled')));
console.log('top tab states:', tabsDisabled);
const btns=await p.locator('button:visible').allInnerTexts().catch(()=>[]);
const bc=[...new Set(btns.map(t=>t.replace(/\s+/g,' ').trim()).filter(x=>x&&x.length<55))];
console.log('BUTTONS('+bc.length+'):'); bc.forEach(x=>console.log('  •',x));
await p.screenshot({path:'docs/product-readiness-audit/screens/qa/explore-design-catalog-loaded.png',fullPage:false});
console.log('--- 4xx/5xx ('+net.length+') ---'); [...new Set(net)].slice(0,40).forEach(x=>console.log('  ',x));
console.log('--- console errors ('+errs.length+') ---'); [...new Set(errs)].slice(0,15).forEach(x=>console.log('  ',x));
await b.close();
