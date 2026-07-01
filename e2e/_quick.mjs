import { chromium } from '@playwright/test';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state.json',viewport:{width:1400,height:900}});
const p=await ctx.newPage();
await p.goto('http://localhost:3000/account-overview',{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});
await p.waitForTimeout(8000);
const t=(await p.locator('body').innerText().catch(()=>'')).replace(/\s+/g,' ');
console.log('account-overview: verifying=',/Verifying session/.test(t),'signin=',/Sign in to continue/.test(t),'len=',t.length,'head=',t.slice(0,80));
await b.close();
