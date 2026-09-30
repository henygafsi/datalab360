/** Visual proof of the workflow pilot table + editor (phrase-first).
 *  Output: e2e/results/wf-*.png */
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

await page.goto('http://localhost:3000/studio/apps/proj_576e16333cdf?view=workflows', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(12000);
await page.screenshot({ path: 'e2e/results/wf-pilot-table.png' });
const t1 = await page.evaluate(() => document.body.innerText);
console.log('PILOT table:', /Workflow/i.test(t1) && /Does/i.test(t1) && /Trigger/i.test(t1));

const edit = page.getByRole('button', { name: 'Edit' }).first();
if (await edit.isVisible().catch(() => false)) {
  await edit.click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'e2e/results/wf-editor-definition.png' });
  const t2 = await page.evaluate(() => document.body.innerText);
  console.log('EDITOR phrase-first:', /When/i.test(t2) && /Then/i.test(t2), '| AI lane:', /Describe the change/i.test(t2), '| simulate:', /Simulate on history/i.test(t2));

  const steps = page.getByRole('tab', { name: 'Steps' });
  if (await steps.isVisible().catch(() => false)) {
    await steps.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: 'e2e/results/wf-editor-steps.png' });
    const t3 = await page.evaluate(() => document.body.innerText);
    console.log('STEPS view:', /step|Steps/i.test(t3), '| palette CTA:', /Add a step/i.test(t3) || /derived from the phrase/i.test(t3));
    const addStep = page.getByRole('button', { name: /Add a step/ });
    if (await addStep.isVisible().catch(() => false)) {
      await addStep.click();
      await page.waitForTimeout(5000);
      await page.screenshot({ path: 'e2e/results/wf-editor-palette.png' });
      const t4 = await page.evaluate(() => document.body.innerText);
      console.log('PALETTE from catalogue:', /(ingestion|transform|delivery|control|python)/i.test(t4));
    } else {
      console.log('PALETTE: no editable steps base on this workflow (honest read-only)');
    }
  }
  // simulate — bounded, no side effects
  await page.getByRole('tab', { name: 'Definition' }).click();
  const sim = page.getByRole('button', { name: /Simulate on history/ });
  if (await sim.isVisible().catch(() => false)) {
    await sim.click();
    await page.waitForTimeout(9000);
    const t5 = await page.evaluate(() => document.body.innerText);
    const m = t5.match(/(\d+ expected triggering|Not computable yet)[^\n]*/);
    console.log('SIMULATE:', m ? m[0].slice(0, 110) : 'no output');
    await page.screenshot({ path: 'e2e/results/wf-editor-simulated.png' });
  }
}
console.log('pageerrors:', errors.length ? errors.slice(0, 3) : 'none');
await browser.close();
