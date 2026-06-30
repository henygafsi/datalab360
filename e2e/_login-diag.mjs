import { chromium } from '@playwright/test';
const BASE='http://localhost:3000';
const ACC='uchsfvb-HAHA', USER='HAHA', PASS=process.env.DATA360_E2E_PASSWORD||'';
const b=await chromium.launch();
const ctx=await b.newContext();
const p=await ctx.newPage();
const bad=[];
p.on('response', r=>{ if(r.status()>=400) bad.push(`${r.status()} ${r.url().replace(BASE,'')}`); });
await p.goto(`${BASE}/signin`,{waitUntil:'domcontentloaded'});
await p.waitForSelector('input[name="account_name"]',{timeout:30000});
for(const [n,v] of [['account_name',ACC],['username',USER],['password',PASS]]){
  const el=p.locator(`input[name="${n}"]`); await el.click(); await el.fill(''); await el.pressSequentially(v,{delay:40}); await p.waitForTimeout(100);
}
await p.click('button[type="submit"]');
await p.waitForTimeout(12000);
console.log('FINAL_URL', p.url().replace(BASE,''));
console.log('BAD_RESPONSES', JSON.stringify([...new Set(bad)].slice(0,15)));
// check NextAuth session
const s = await p.request.get(`${BASE}/api/auth/session`).then(r=>r.json()).catch(()=>({}));
console.log('SESSION_USER', s && s.user ? (s.user.username||s.user.name||'present') : 'NONE');
await b.close();
