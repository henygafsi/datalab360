/** Visual proof of the converged workspace: Overview brief (default),
 *  grouped nav, pinned Objects table on Data·Sources, activation panel.
 *  Output: e2e/results/converged-*.png */
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

const APP = 'http://localhost:3000/studio/apps/proj_576e16333cdf';
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

// 1 · default = Overview brief
await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(12000);
await page.screenshot({ path: 'e2e/results/converged-overview.png' });
const t1 = await page.evaluate(() => document.body.innerText);
console.log('OVERVIEW has next-best-action:', /Next best action/i.test(t1), '| lifecycle chip:', /(Draft|Ready to activate|Active|Degraded)/.test(t1));

// 2 · activation panel opens in place
const actBtn = page.getByRole('button', { name: /Activation panel/i }).first();
if (await actBtn.isVisible().catch(() => false)) {
  await actBtn.click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'e2e/results/converged-activation.png' });
  const t2 = await page.evaluate(() => document.body.innerText);
  console.log('ACTIVATION visible words:', /(activation|credits|funding|checks)/i.test(t2));
}

// 3 · Data → Sources = the pinned first-class table
await page.goto(APP + '?view=sources', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
await page.screenshot({ path: 'e2e/results/converged-sources.png' });
const t3 = await page.evaluate(() => document.body.innerText);
console.log('SOURCES pinned table headers:', /Object/.test(t3) && /Origin/.test(t3) && /Understanding/.test(t3), '| no app selector:', !/^\s*Application\s*$/m.test(t3));

// 4 · Automation → Workflows standalone + old deep URL ?view=jobs still lands on Jobs
await page.goto(APP + '?view=workflows', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(7000);
const t4 = await page.evaluate(() => document.body.innerText);
console.log('WORKFLOWS view:', /Workflows/.test(t4) && /activation panel/i.test(t4));
await page.screenshot({ path: 'e2e/results/converged-workflows.png' });
await page.goto(APP + '?view=jobs', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(7000);
const t5 = await page.evaluate(() => document.body.innerText);
console.log('JOBS deep URL:', /Loads/.test(t5), '| automations toggle gone:', !/Process kind/.test(t5));

console.log('pageerrors:', errors.length ? errors.slice(0, 3) : 'none');
await browser.close();
