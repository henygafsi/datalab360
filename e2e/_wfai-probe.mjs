import { chromium } from '@playwright/test';
const SHOT = '/Users/datalab360/.claude/jobs/7696d9e1/tmp/wfai';
const run = async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ storageState: 'e2e/.auth/state.json', viewport: { width: 1680, height: 950 } });
  const p = await ctx.newPage();
  p.on('response', async (r) => {
    if (r.url().includes('/steps') && r.request().method() === 'GET') {
      const t = await r.text().catch(() => '');
      console.log('STEPS', r.status(), r.url().slice(-70), t.slice(0, 250));
    }
  });
  await p.goto('http://localhost:3000/workflow', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(7000);
  const row = p.getByText('WC_LIVE_DELETEME', { exact: true }).first();
  console.log('gate row visible:', await row.isVisible().catch(() => false));
  if (await row.isVisible().catch(() => false)) { await row.click(); }
  await p.waitForTimeout(12000);
  console.log('nodes:', await p.locator('.react-flow__node').count());
  await p.screenshot({ path: `${SHOT}/10-probe.png` });
  await b.close();
};
run().catch((e) => { console.error('FATAL', String(e).slice(0, 200)); process.exit(1); });
