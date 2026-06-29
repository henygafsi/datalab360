import { chromium } from '@playwright/test';
const BASE='http://localhost:3000';
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1600,height:1000}}); const p=await ctx.newPage();
await p.goto(`${BASE}/signin`,{waitUntil:'domcontentloaded'}); await p.waitForSelector('input[name="account_name"]',{timeout:25000}); await p.waitForTimeout(1500);
for(const [n,v] of [['account_name','uchsfvb-HAHA'],['username','HAHA'],['password','NewSecurePassword123!']]){const el=p.locator(`input[name="${n}"]`); await el.click(); await el.fill(''); await el.pressSequentially(v,{delay:45});}
await p.locator('button[type="submit"]').click(); await p.waitForURL(u=>!u.toString().includes('/signin'),{timeout:45000}).catch(()=>{}); await p.waitForTimeout(2500);
for(const r of ['/observability','/email-templates']){
  await p.goto(`${BASE}${r}`,{waitUntil:'networkidle',timeout:30000}).catch(()=>{}); await p.waitForTimeout(9000);
  const body=(await p.locator('body').innerText().catch(()=> '')) || '';
  console.log(`${r} :: bodyLen=${body.trim().length}`);
  console.log('   main:', body.replace(/\s+/g,' ').slice(560,760));
}
await b.close();
