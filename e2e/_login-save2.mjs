import { chromium } from '@playwright/test';
const BASE='http://localhost:3000';
const ACC='uchsfvb-HAHA', USER='HAHA', PASS=process.env.DATA360_E2E_PASSWORD||'';
const b=await chromium.launch();
const ctx=await b.newContext();
const p=await ctx.newPage();
await p.goto(`${BASE}/signin`,{waitUntil:'domcontentloaded'});
await p.waitForSelector('input[name="account_name"]',{timeout:30000});
for(const [n,v] of [['account_name',ACC],['username',USER],['password',PASS]]){
  const el=p.locator(`input[name="${n}"]`); await el.click(); await el.fill(''); await el.pressSequentially(v,{delay:40}); await p.waitForTimeout(100);
}
await p.click('button[type="submit"]');
await p.waitForURL(u=>!u.toString().includes('/signin'),{timeout:40000}).catch(()=>{});
await p.waitForTimeout(3000);
const s = await p.request.get(`${BASE}/api/auth/session`).then(r=>r.json()).catch(()=>({}));
if(s && s.user){ await ctx.storageState({path:'e2e/.auth/state.json'}); console.log('SAVED_STATE user=', s.user.username||s.user.name); }
else console.log('NO_SESSION url='+p.url());
await b.close();
