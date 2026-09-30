/** Visual proof: workflow steps as interactive canvas + data-profiles panel.
 *  Output: e2e/results/canvas-*.png, profiles-*.png */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

mkdirSync('e2e/results', { recursive: true });
const PASS = process.env.D360_PASS ?? '';
if (!PASS) { console.error('D360_PASS required'); process.exit(1); }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
await page.goto('http://localhost:3000/signin', { waitUntil: 'domcontentloaded' });
await page.locator('input[name="account_name"], input#account_name').first().fill(process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038');
await page.locator('input[name="username"], input#username').first().fill(process.env.D360_USER ?? 'ORGAADMIN_USER');
await page.locator('input[type="password"]').first().fill(PASS);
await page.locator('button[type="submit"]').first().click();
for (let i = 0; i < 45; i++) {
  const ok = await page.request.get('http://localhost:3000/api/auth/session').then(r => r.json()).then(s => Boolean(s?.user?.access_token)).catch(() => false);
  if (ok) break;
  await page.waitForTimeout(2000);
}
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const APP = 'http://localhost:3000/studio/apps/proj_576e16333cdf';

// 1 · workflow editor Steps = interactive canvas
await page.goto(APP + '?view=workflows', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(12000);
const edit = page.getByRole('button', { name: 'Edit' }).first();
if (await edit.isVisible().catch(() => false)) {
  await edit.click();
  await page.waitForTimeout(3000);
  await page.getByRole('tab', { name: 'Steps' }).click();
  await page.waitForTimeout(3000);
  const flow = page.locator('.react-flow__node');
  const n = await flow.count();
  console.log('CANVAS nodes:', n);
  if (n > 0) {
    await flow.first().click();
    await page.waitForTimeout(1200);
    const t = await page.evaluate(() => document.body.innerText);
    console.log('NODE config beside:', /read-only in this version|remove this step|database|table|kind|audience/i.test(t));
  }
  await page.screenshot({ path: 'e2e/results/canvas-steps.png' });
}

// 2 · governance: profiles panel leads
await page.goto(APP + '?view=access', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
await page.screenshot({ path: 'e2e/results/profiles-list.png' });
const t2 = await page.evaluate(() => document.body.innerText);
console.log('PROFILES panel:', /Data profiles/.test(t2), '| roles-vs-profiles words:', /what data they SEE/i.test(t2));

const newBtn = page.getByRole('button', { name: /New profile/ });
if (await newBtn.isVisible().catch(() => false)) {
  await newBtn.click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'e2e/results/profiles-new.png' });
  const t3 = await page.evaluate(() => document.body.innerText);
  console.log('SHEET steps:', /Definition/.test(t3) && /Plan & apply/.test(t3) && /Evidence/.test(t3), '| ready-to-select objects:', /SRC_/.test(t3));
}
console.log('pageerrors:', errors.length ? errors.slice(0, 3) : 'none');
await browser.close();
