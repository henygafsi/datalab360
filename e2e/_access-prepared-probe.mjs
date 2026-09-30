/** Visual proof of the regrouped « Prepared change » (Access tab).
 *  Planning executes nothing (diff only). Output: e2e/results/access-prepared.png */
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
await page.goto('http://localhost:3000/studio/apps/proj_576e16333cdf?view=access', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
// map ONE principal to a role first — the plan button stays honest-disabled
// until a mapping exists (local state, per the audit)
const roleSel = page.locator('select[aria-label^="Data360 role for"]').first();
await roleSel.scrollIntoViewIfNeeded();
const options = await roleSel.locator('option').allTextContents();
const firstReal = await roleSel.locator('option:not([value=""])').first().getAttribute('value');
console.log('role options:', options.join(' | '), '→ picking', firstReal);
await roleSel.selectOption(firstReal);
const prep = page.getByRole('button', { name: /Prepare the change/i });
await prep.scrollIntoViewIfNeeded();
await prep.click();
await page.getByText(/Prepared change — tick a group/i).waitFor({ timeout: 60000 });
await page.getByText(/Prepared change/i).first().scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await page.screenshot({ path: 'e2e/results/access-prepared.png', fullPage: false });
const body = await page.evaluate(() => document.body.innerText);
const seg = body.slice(body.indexOf('Prepared change'), body.indexOf('Prepared change') + 900);
console.log(seg);
await browser.close();
