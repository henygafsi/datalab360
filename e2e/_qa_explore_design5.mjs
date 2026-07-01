import { chromium } from '@playwright/test';
const BASE='http://localhost:3000';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state-minted.json',viewport:{width:1680,height:1000}});
const p=await ctx.newPage();
const errs=[],net=[];
p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,140));});
p.on('response',r=>{const s=r.status();if(s>=400)net.push(s+' '+r.request().method()+' '+r.url().replace(BASE,'').split('?')[0]);});
const snap=async(tag)=>{const bt=(await p.locator('body').innerText().catch(()=>'')).replace(/\s+/g,' ').trim();console.log(`[${tag}] len=${bt.length} ::`,bt.slice(160,560));};
await p.goto(`${BASE}/explore-design`,{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});
await p.waitForTimeout(6000);
await p.locator('button').filter({hasText:'SEED_EXP_RLS_MODEL'}).first().click().catch(e=>console.log('pick',e.message));
await p.waitForTimeout(9000);
await snap('catalog-loaded');

// --- Toolbar buttons present (catalog) ---
let bc=[...new Set((await p.locator('button:visible').allInnerTexts()).map(t=>t.replace(/\s+/g,' ').trim()).filter(x=>x&&x.length<48))];
console.log('CATALOG buttons:',JSON.stringify(bc));

// --- Search filter ---
const search=p.getByPlaceholder(/Search tables/i).first();
if(await search.count()){ await search.fill('FACT_ORDERS').catch(()=>{}); await p.waitForTimeout(1500);
  const bt=(await p.locator('body').innerText().catch(()=>'')).replace(/\s+/g,' ');
  console.log('SEARCH FACT_ORDERS -> FACT count:',(bt.match(/FACT_ORDERS/g)||[]).length,'DIM_CLIENTS present?',/DIM_CLIENTS/.test(bt));
  await search.fill('').catch(()=>{}); await p.waitForTimeout(800);
}

// --- Click a table row ---
const row=p.locator('text=DIM_CLIENTS').first();
if(await row.count()){ await row.click().catch(e=>console.log('row',e.message)); await p.waitForTimeout(4000); await snap('after-DIM_CLIENTS-click');
  let bc2=[...new Set((await p.locator('button:visible').allInnerTexts()).map(t=>t.replace(/\s+/g,' ').trim()).filter(x=>x&&x.length<48))];
  console.log('AFTER ROW CLICK new buttons:',JSON.stringify(bc2.filter(x=>!bc.includes(x))));
  await p.screenshot({path:'docs/product-readiness-audit/screens/qa/ed-table-detail.png'});
}

// --- Modeling tab ---
await p.locator('button').filter({hasText:/^Modeling$/}).first().click().catch(e=>console.log('mod',e.message));
await p.waitForTimeout(7000); await snap('modeling');
console.log('canvas present?', await p.locator('.react-flow, [data-testid="rf__wrapper"], canvas').count());
let mb=[...new Set((await p.locator('button:visible').allInnerTexts()).map(t=>t.replace(/\s+/g,' ').trim()).filter(x=>x&&x.length<48))];
console.log('MODELING buttons:',JSON.stringify(mb));
await p.screenshot({path:'docs/product-readiness-audit/screens/qa/ed-modeling.png'});

// --- AI Model wizard (open, read-only) ---
const ai=p.locator('button').filter({hasText:/^AI Model$/}).first();
if(await ai.count() && !(await ai.isDisabled().catch(()=>true))){ await ai.click().catch(e=>console.log('ai',e.message)); await p.waitForTimeout(4000); await snap('ai-model-wizard');
  await p.screenshot({path:'docs/product-readiness-audit/screens/qa/ed-aimodel.png'});
  // close
  await p.keyboard.press('Escape').catch(()=>{}); await p.waitForTimeout(1000);
}

// --- Deploy panel (open, DO NOT submit) ---
const dep=p.locator('button').filter({hasText:/^Deploy$/}).first();
if(await dep.count() && !(await dep.isDisabled().catch(()=>true))){ await dep.click().catch(e=>console.log('dep',e.message)); await p.waitForTimeout(5000); await snap('deploy-panel');
  let db=[...new Set((await p.locator('button:visible').allInnerTexts()).map(t=>t.replace(/\s+/g,' ').trim()).filter(x=>x&&x.length<48))];
  console.log('DEPLOY panel buttons:',JSON.stringify(db));
  await p.screenshot({path:'docs/product-readiness-audit/screens/qa/ed-deploy.png'});
}

console.log('--- 4xx/5xx ('+net.length+') ---'); [...new Set(net)].slice(0,50).forEach(x=>console.log('  ',x));
console.log('--- console errors ('+errs.length+') ---'); [...new Set(errs)].slice(0,15).forEach(x=>console.log('  ',x));
await b.close();
