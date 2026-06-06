import { chromium } from '@playwright/test';
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext()).newPage();
const auth = [];
p.on('response', async (r) => {
  const u = r.url();
  if (/signin|login|auth|token/i.test(u) && !/\.(js|css|png)/.test(u)) {
    let body=''; try { body = (await r.text()).slice(0,200); } catch {}
    auth.push(`${r.status()} ${u.replace('http://api.datalab360.io','')} :: ${body}`);
  }
});
await p.goto('http://localhost:3000/signin', { waitUntil:'domcontentloaded', timeout:30000 });
await p.fill('input[name="account_name"]', 'HAHA');
await p.fill('input[name="username"]', 'HAHA');
await p.fill('input[name="password"]', 'NewSecurePassword123!');
await p.click('button[type="submit"]');
await p.waitForTimeout(6000);
const err = await p.locator('.text-red-600, .text-red-400, [role="alert"]').allTextContents().catch(()=>[]);
console.log('FINAL_URL', p.url());
console.log('VISIBLE_ERR', JSON.stringify(err).slice(0,300));
console.log('AUTH_CALLS:'); for (const a of auth) console.log('  ', a);
await b.close();
