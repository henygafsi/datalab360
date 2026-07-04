import { chromium } from '@playwright/test';
const BASE='http://localhost:3000';
const PASS=process.env.DATA360_E2E_PASSWORD||'';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1600,height:950}})).newPage();
const errs=[];
p.on('console', m => { if (m.type()==='error') errs.push(m.text().slice(0,200)); });
p.on('pageerror', e => errs.push('PAGEERROR: '+String(e).slice(0,300)));
await p.goto(`${BASE}/signin`,{waitUntil:'domcontentloaded',timeout:60000}).catch(e=>console.log('goto err',String(e).slice(0,100)));
await p.waitForTimeout(4000);
const hasForm = await p.locator('input[name="account_name"]').isVisible().catch(()=>false);
console.log('signin form visible:', hasForm, '| url:', p.url());
if (hasForm) {
  for (const [n,v] of [['account_name','uchsfvb-HAHA'],['username','HAHA'],['password',PASS]]) {
    const el=p.locator(`input[name="${n}"]`); await el.click(); await el.fill(''); await el.pressSequentially(v,{delay:25});
  }
  await p.click('button[type="submit"]');
  for (let i=1;i<=6;i++){ await p.waitForTimeout(3000); console.log(` t+${i*3}s url=${p.url().replace(BASE,'')}`); }
  const body=(await p.locator('body').innerText().catch(()=>''))||'';
  console.log('final body head:', body.slice(0,200).replace(/\n/g,' | '));
}
await p.screenshot({path:'e2e/.auth/forensic.png'});
console.log('console errors (first 6):'); errs.slice(0,6).forEach(e=>console.log('  -',e));
await b.close();
