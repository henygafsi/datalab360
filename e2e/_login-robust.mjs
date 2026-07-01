import { chromium } from '@playwright/test';
import fs from 'node:fs';
const BASE='http://localhost:3000';
const ACC='uchsfvb-HAHA', USER='HAHA', PASS=process.env.DATA360_E2E_PASSWORD||'';
if(!PASS){console.error('no pass');process.exit(1);}
const b=await chromium.launch();
const ctx=await b.newContext();
const p=await ctx.newPage();
let ok=false;
for(let attempt=1;attempt<=3 && !ok;attempt++){
  try{
    await p.goto(`${BASE}/signin`,{waitUntil:'networkidle'}).catch(()=>{});
    await p.waitForSelector('input[name="account_name"]',{timeout:25000});
    for(const [n,v] of [['account_name',ACC],['username',USER],['password',PASS]]){
      const el=p.locator(`input[name="${n}"]`);
      await el.click(); await el.fill(''); await p.waitForTimeout(80);
      await el.pressSequentially(v,{delay:45}); await p.waitForTimeout(120);
    }
    await Promise.all([
      p.waitForURL(u=>!u.toString().includes('/signin'),{timeout:45000}).catch(()=>{}),
      p.click('button[type="submit"]'),
    ]);
    await p.waitForTimeout(4000);
    ok = !p.url().includes('/signin');
    console.log(`attempt ${attempt}: url=${p.url().replace(BASE,'')} ok=${ok}`);
  }catch(e){console.log(`attempt ${attempt} err: ${String(e).slice(0,120)}`);}
}
if(ok){ await ctx.storageState({path:'e2e/.auth/state.json'}); console.log('SAVED_STATE'); }
else { console.log('LOGIN_FAILED'); }
await b.close();
