import { chromium } from '@playwright/test';
const BASE='http://localhost:3000';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state-minted.json',viewport:{width:1680,height:1000}});
const p=await ctx.newPage();
const errs=[],net=[];
p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,160));});
p.on('response',r=>{const s=r.status();if(s>=400)net.push(s+' '+r.request().method()+' '+r.url().replace(BASE,'').split('?')[0]);});
await p.goto(`${BASE}/explore-design`,{waitUntil:'domcontentloaded',timeout:60000}).catch(e=>console.log('nav:',e.message));
await p.waitForTimeout(4000);
// Wait for projects to load (look for a project card / Open button)
let picked=false;
for(let i=0;i<20;i++){
  const txt=(await p.locator('body').innerText().catch(()=>'')).replace(/\s+/g,' ');
  if(!/Loading…/.test(txt) || /proj_/.test(txt)) { /* maybe loaded */ }
  // try clicking an "Open" / project row
  const openBtn=p.getByRole('button',{name:/^Open$|Open project|Continue|Resume/i}).first();
  if(await openBtn.count().catch(()=>0)){ await openBtn.click().catch(()=>{}); picked=true; break; }
  // click a project card by id text
  const card=p.locator('text=/proj_[0-9a-f]+/').first();
  if(await card.count().catch(()=>0)){ await card.click().catch(()=>{}); 
    await p.waitForTimeout(800);
    const ob=p.getByRole('button',{name:/Open|Continue|Resume|Select/i}).first();
    if(await ob.count().catch(()=>0)){await ob.click().catch(()=>{}); picked=true; break;}
  }
  await p.waitForTimeout(1500);
}
console.log('picked project?', picked);
await p.waitForTimeout(5000);
let bt=(await p.locator('body').innerText().catch(()=>'')).replace(/\s+/g,' ').trim();
console.log('AFTER PICK body head:', bt.slice(0,900));
const btns=await p.locator('button:visible').allInnerTexts().catch(()=>[]);
const bc=[...new Set(btns.map(t=>t.replace(/\s+/g,' ').trim()).filter(x=>x&&x.length<55))];
console.log('BUTTONS('+bc.length+'):'); bc.forEach(x=>console.log('  •',x));
await p.screenshot({path:'docs/product-readiness-audit/screens/qa/explore-design-picked.png',fullPage:false});

// Visit top tabs
for(const tab of ['Catalog','Modeling','AI Model','Deploy']){
  const t=p.getByRole('button',{name:new RegExp('^'+tab+'$','i')}).first();
  if(await t.count().catch(()=>0)){
    await t.click().catch(e=>console.log('click err',tab,e.message));
    await p.waitForTimeout(3500);
    const tt=(await p.locator('body').innerText().catch(()=>'')).replace(/\s+/g,' ').trim();
    console.log(`=== TAB ${tab} === len`,tt.length,'head:',tt.slice(200,650));
    await p.screenshot({path:`docs/product-readiness-audit/screens/qa/explore-design-${tab.replace(/\s/g,'')}.png`,fullPage:false});
  } else console.log('tab not found:',tab);
}
console.log('--- 4xx/5xx ('+net.length+') ---'); [...new Set(net)].slice(0,40).forEach(x=>console.log('  ',x));
console.log('--- console errors ('+errs.length+') ---'); [...new Set(errs)].slice(0,20).forEach(x=>console.log('  ',x));
await b.close();
