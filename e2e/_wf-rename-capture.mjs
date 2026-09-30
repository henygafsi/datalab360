/** Capture the EXACT patch the editor sends on a rename save. */
import { chromium } from '@playwright/test';

const PASS = process.env.D360_PASS ?? '';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
await page.goto('http://localhost:3000/signin', { waitUntil: 'domcontentloaded' });
await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-ky11038');
await page.locator('input[name="username"], input#username').first().fill('ORGAADMIN_USER');
await page.locator('input[type="password"]').first().fill(PASS);
await page.locator('button[type="submit"]').first().click();
for (let i = 0; i < 45; i++) {
  const ok = await page.request.get('http://localhost:3000/api/auth/session').then(r => r.json()).then(s => Boolean(s?.user?.access_token)).catch(() => false);
  if (ok) break;
  await page.waitForTimeout(2000);
}
page.on('request', (r) => {
  if (r.url().includes('/model/') && r.method() === 'POST') {
    console.log('REQ', r.url());
    console.log('BODY', (r.postData() ?? '').slice(0, 400));
  }
});
page.on('response', async (r) => {
  if (r.url().includes('/model/') && r.request().method() === 'POST') {
    console.log('RESP', r.status(), (await r.text().catch(() => '')).slice(0, 300));
  }
});
await page.goto('http://localhost:3000/studio/apps/proj_576e16333cdf?view=workflows', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
await page.getByRole('button', { name: 'Edit' }).first().click();
const input = page.getByLabel('Workflow name');
await input.waitFor({ timeout: 20000 });
console.log('editing name:', await input.inputValue());
await input.fill('CAPTURE PROBE');
await page.getByRole('button', { name: /Save 1 change/ }).click();
await page.waitForTimeout(8000);
const body = await page.evaluate(() => document.body.innerText);
console.log('still shows Save?', /Save 1 change/.test(body), '| error shown?', /not supported|failed/i.test(body));
await browser.close();
