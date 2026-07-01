import { chromium } from '@playwright/test';
const BASE='http://localhost:3000';
const STORAGE='/Users/datalab360/Documents/data360_pro/datalab360Front/e2e/.auth/state-minted.json';
const SHOT='/Users/datalab360/Documents/data360_pro/datalab360Front/docs/product-readiness-audit/screens/qa/data-products.png';
const out={console:[],net:[]};
const log=(...m)=>console.log(...m);
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({storageState:STORAGE,viewport:{width:1440,height:1000}});
const page=await ctx.newPage();
page.on('pageerror',e=>out.console.push('pageerror: '+(e.message||e).slice(0,160)));
page.on('console',m=>{if(m.type()==='error')out.console.push('console.error: '+m.text().slice(0,160));});
page.on('response',r=>{const u=r.url().replace(BASE,'');const s=r.status();
  if(s>=400 && !/\.(png|jpg|svg|woff2?|ico|css|js)/.test(u.split('?')[0]) && !/_next/.test(u))out.net.push(s+' '+r.request().method()+' '+u.split('?')[0]);});
await page.goto(BASE+'/data-products',{waitUntil:'domcontentloaded',timeout:90000});
const cards=page.locator('[class*="cursor-pointer"][class*="rounded-xl"]');
// wait until loading settles: cards present OR empty-state OR error
for(let i=0;i<30;i++){await page.waitForTimeout(2000);
  const n=await cards.count();
  const empty=await page.locator('text=/No data products yet|No products match/').count();
  const err=await page.locator('text=Failed to load data products').count();
  const sk=await page.locator('[class*="animate-pulse"]').count();
  if(n>0||empty>0||err>0){log('settled iter='+i+' cards='+n+' empty='+empty+' err='+err+' skeleton='+sk);break;}
  if(i===29)log('NEVER SETTLED cards='+n+' skeleton='+sk);}
const kpiGrid=await page.locator('.grid').first().innerText().catch(()=>'');
log('KPI: '+kpiGrid.replace(/\n+/g,' | ').slice(0,400));
log('cards='+await cards.count());
if(await cards.count()>0){
  await cards.first().click();await page.waitForTimeout(3000);
  log('detail h3: '+await page.locator('div[class*="p-5"] h3').first().innerText().catch(()=>'?'));
  log('Publish gate: '+(await page.locator('text=Publish gate').count()>0)+' | Lifecycle: '+(await page.locator('text=Lifecycle actions').count()>0)+' | KPIs: '+(await page.locator('h4:has-text("KPIs")').count()>0)+' | Recos: '+(await page.locator('h4:has-text("Recommendations")').count()>0));
  // publish gate rows text
  const pg=await page.locator('div:has(> h4:has-text("Publish gate"))').first().innerText().catch(()=>'');
  log('PublishGate body: '+pg.replace(/\n+/g,' | ').slice(0,300));
  const pubBtn=page.locator('button:has-text("Publish as data share")');
  if(await pubBtn.count()>0)log('Publish btn disabled='+await pubBtn.first().isDisabled()+' title='+(await pubBtn.first().getAttribute('title')||'-'));
  // expand subscribers + lineage
  const ms=page.locator('button:has-text("Manage subscribers")');
  if(await ms.count()>0){await ms.first().click();await page.waitForTimeout(2500);
    log('Subscribers expanded: '+(await page.locator('text=/Subscribers \\(/').count()>0));}
  const vl=page.locator('button:has-text("View lineage")');
  if(await vl.count()>0){await vl.first().click();await page.waitForTimeout(2500);
    log('Lineage Upstream shown: '+(await page.locator('text=/Upstream \\(/').count()>0));}
  const kpiBody=await page.locator('div:has(> div > h4:has-text("KPIs"))').first().innerText().catch(()=>'');
  log('KPI panel: '+kpiBody.replace(/\n+/g,' | ').slice(0,200));
  const recoBody=await page.locator('div:has(> div > h4:has-text("Recommendations"))').first().innerText().catch(()=>'');
  log('Reco panel: '+recoBody.replace(/\n+/g,' | ').slice(0,200));
}
await page.screenshot({path:SHOT,fullPage:true}).catch(()=>{});
log('NET>=400 ('+out.net.length+'): '+JSON.stringify(out.net.slice(0,20)));
log('CONSOLE('+out.console.length+'): '+JSON.stringify([...new Set(out.console)].slice(0,8)));
await browser.close();
