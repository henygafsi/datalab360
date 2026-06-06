import { chromium } from '@playwright/test';
const b = await chromium.launch({ headless: true });

// 1) try the saved auth state → admin page
try {
  const ctx = await b.newContext({ storageState: 'e2e/.auth/state.json' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000/admin/data360-config', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForTimeout(2500);
  console.log('SAVED_STATE url=', p.url(), 'redirectedToSignin=', p.url().includes('/signin'));
  await p.screenshot({ path: 'e2e/admin-audit/savedstate-admin.png', fullPage: true });
  await ctx.close();
} catch (e) { console.log('SAVED_STATE_ERR', String(e.message).slice(0,100)); }

// 2) dump signin form
const p2 = await (await b.newContext()).newPage();
await p2.goto('http://localhost:3000/signin', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
await p2.waitForTimeout(1500);
const inputs = await p2.$$eval('input', els => els.map(e => ({ name: e.name, type: e.type, ph: e.placeholder })));
const btns = await p2.$$eval('button', els => els.map(e => (e.textContent||'').trim()).filter(Boolean));
console.log('SIGNIN_INPUTS', JSON.stringify(inputs));
console.log('SIGNIN_BUTTONS', JSON.stringify(btns));
await b.close();
