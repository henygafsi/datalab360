import { chromium } from '@playwright/test';
const STATE='/Users/datalab360/Documents/data360_pro/datalab360Front/e2e/.auth/state-minted.json';
const SHOT='/Users/datalab360/Documents/data360_pro/datalab360Front/docs/product-readiness-audit/screens/qa/data-source-connection.png';
const URL='http://localhost:3000/data-source-connection';
const consoleErrs=[]; const netErrs=[];
const browser=await chromium.launch();
const ctx=await browser.newContext({storageState:STATE});
const page=await ctx.newPage();
page.on('console',m=>{if(m.type()==='error')consoleErrs.push(m.text().slice(0,300));});
page.on('response',r=>{if(r.status()>=400)netErrs.push(`${r.status()} ${r.request().method()} ${r.url().replace(/\?.*/,'')}`);});
await page.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
// poll for real content
let bodyText='';
for(let i=0;i<25;i++){
  bodyText=await page.evaluate(()=>document.body.innerText);
  if(bodyText && (bodyText.includes('Data Source')||bodyText.includes('Connection')||bodyText.includes('Connector')) && !bodyText.includes('Sign in')) break;
  await page.waitForTimeout(2000);
}
const url=page.url();
console.log('FINAL_URL:',url);
console.log('SIGNIN_REDIRECT:', url.includes('signin')||url.includes('sign-in'));
console.log('BODY_LEN:',bodyText.length);
console.log('BODY_SNIPPET:',JSON.stringify(bodyText.slice(0,600)));
// enumerate buttons
const btns=await page.$$eval('button',els=>els.map(e=>({t:(e.innerText||e.getAttribute('aria-label')||e.title||'').trim().slice(0,40),dis:e.disabled})).filter(b=>b.t));
console.log('BUTTON_COUNT:',btns.length);
console.log('BUTTONS:',JSON.stringify(btns.slice(0,50)));
// look for health strip / catalog / source hub presence
for(const kw of ['Connector','Health','Catalog','Active','Connection','Choose Your Data Platform','Snowflake','PostgreSQL','Oracle','AI']){
  console.log('HAS_'+kw.replace(/ /g,'_')+':', bodyText.includes(kw));
}
await page.screenshot({path:SHOT,fullPage:true});
console.log('--- click AI helper (Sparkles) ---');
try{
  const ai=await page.locator('button:has-text("AI"), button[title*="AI"], button:has-text("Sparkles")').first();
  if(await ai.count()){ await ai.click({timeout:4000}); await page.waitForTimeout(1500);
    const after=await page.evaluate(()=>document.body.innerText);
    console.log('AI_MODAL_OPENED:', after.includes('connector')||after.includes('Paste')||after.includes('Describe')||after.length>bodyText.length);
  } else console.log('AI button not found by text');
}catch(e){console.log('AI click err:',e.message.slice(0,120));}
await browser.close();
console.log('=== CONSOLE_ERRORS ('+consoleErrs.length+') ===');
consoleErrs.slice(0,20).forEach(e=>console.log('  CE:',e));
console.log('=== NET_>=400 ('+netErrs.length+') ===');
[...new Set(netErrs)].slice(0,30).forEach(e=>console.log('  NET:',e));
