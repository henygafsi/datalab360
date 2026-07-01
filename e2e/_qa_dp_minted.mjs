import { chromium } from '@playwright/test';
const BASE='http://localhost:3000';
const STORAGE='/Users/datalab360/Documents/data360_pro/datalab360Front/e2e/.auth/state-minted.json';
const SHOT='/Users/datalab360/Documents/data360_pro/datalab360Front/docs/product-readiness-audit/screens/qa/data-products.png';
const out={console:[],net:[],steps:[]};
const log=(m)=>{out.steps.push(m);console.log(m);};
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({storageState:STORAGE,viewport:{width:1440,height:1000}});
const page=await ctx.newPage();
page.on('pageerror',e=>{out.console.push('pageerror: '+(e.message||e).slice(0,200));});
page.on('console',m=>{if(m.type()==='error')out.console.push('console.error: '+m.text().slice(0,200));});
page.on('response',r=>{const u=r.url().replace(BASE,'');const s=r.status();
  if(s>=400 && !/\.(png|jpg|svg|woff2?|ico|css|js|json\b)/.test(u.split('?')[0]) && !/_next/.test(u)){out.net.push(s+' '+r.request().method()+' '+u.split('?')[0]);}});
await page.goto(BASE+'/data-products',{waitUntil:'domcontentloaded',timeout:90000});
// poll for content
let body='';
for(let i=0;i<25;i++){await page.waitForTimeout(2000);body=(await page.locator('body').innerText().catch(()=>'')).toLowerCase();
  if(page.url().includes('/signin')){log('SIGNIN REDIRECT');break;}
  if(/product portfolio/.test(body) && !/loading\.\.\./.test(body.slice(0,50))){break;}}
log('URL: '+page.url());
log('has Product Portfolio header: '+/product portfolio/.test(body));
log('skeleton count: '+await page.locator('[class*="animate-pulse"]').count());
// KPI tiles
const kpiGrid=await page.locator('.grid').first().innerText().catch(()=>'');
log('KPI grid text: '+kpiGrid.replace(/\n+/g,' | ').slice(0,400));
// product cards
const cards=page.locator('[class*="cursor-pointer"][class*="rounded-xl"]');
const nCards=await cards.count();
log('product cards: '+nCards);
// status filter test
await page.locator('select[aria-label="Filter by status"]').selectOption('certified').catch(()=>{});
await page.waitForTimeout(800);
log('after certified filter, cards: '+await cards.count());
await page.locator('select[aria-label="Filter by status"]').selectOption('').catch(()=>{});
await page.waitForTimeout(500);
// search test
await page.locator('input[aria-label="Search products"]').fill('zzznomatchqq').catch(()=>{});
await page.waitForTimeout(800);
log('after no-match search, empty visible: '+(await page.locator('text=/No products match/').count()>0));
await page.locator('input[aria-label="Search products"]').fill('').catch(()=>{});
await page.waitForTimeout(500);
// open detail panel
if(nCards>0){
  await cards.first().click();await page.waitForTimeout(2500);
  const dn=await page.locator('div[class*="p-5"] h3').first().innerText().catch(()=>null);
  log('detail panel product: '+dn);
  log('Publish gate visible: '+(await page.locator('text=Publish gate').count()>0));
  const pubBtn=page.locator('button:has-text("Publish as data share")');
  if(await pubBtn.count()>0){log('Publish btn disabled: '+await pubBtn.first().isDisabled()+' title: '+await pubBtn.first().getAttribute('title'));}
  // publish gate score rows
  log('Lifecycle actions visible: '+(await page.locator('text=Lifecycle actions').count()>0));
  // expand subscribers
  const ms=page.locator('button:has-text("Manage subscribers")');
  if(await ms.count()>0){await ms.first().click();await page.waitForTimeout(2500);
    log('subscribers section after expand: '+(await page.locator('text=/Subscribers \\(/').count()>0));
    const sub=page.locator('button:has-text("Subscribe my account")');
    if(await sub.count()>0)log('Subscribe my account disabled: '+await sub.first().isDisabled()+' title: '+await sub.first().getAttribute('title'));}
  // expand lineage
  const vl=page.locator('button:has-text("View lineage")');
  if(await vl.count()>0){await vl.first().click();await page.waitForTimeout(2500);
    log('lineage Upstream label visible: '+(await page.locator('text=/Upstream \\(/').count()>0));}
  // KPI panel
  log('KPIs header visible: '+(await page.locator('h4:has-text("KPIs")').count()>0));
  log('Recommendations header visible: '+(await page.locator('h4:has-text("Recommendations")').count()>0));
  // Activity toggle
  const act=page.locator('button:has-text("Activity")');
  if(await act.count()>0){await act.first().click();await page.waitForTimeout(2500);
    log('Activity expanded - No activity OR rows: '+((await page.locator('text=No activity yet').count())+' empty / events ol present '+(await page.locator('ol li').count())));}
  // Object 360
  const o3=page.locator('button:has-text("Object 360")');
  if(await o3.count()>0){await o3.first().click();await page.waitForTimeout(3000);
    log('Object360 panel opened (close btn): '+(await page.locator('button[aria-label="Close"]').count()>0));}
}
await page.screenshot({path:SHOT,fullPage:true}).catch(e=>log('shot fail '+e.message));
log('--- NET >=400 ('+out.net.length+') ---');out.net.forEach(n=>log(n));
log('--- CONSOLE ERR ('+out.console.length+') ---');out.console.slice(0,15).forEach(c=>log(c));
await browser.close();
