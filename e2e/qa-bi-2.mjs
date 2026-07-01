import { chromium } from '@playwright/test';
const STATE = '/Users/datalab360/Documents/data360_pro/datalab360Front/e2e/.auth/state-minted.json';
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STATE, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const calls = [];
page.on('response', async r => {
  const u = r.url();
  if (u.includes('/projects/unified') || u.includes('/command-center') || u.includes('/bi-dashboard')) {
    calls.push(`${r.status()} ${r.request().method()} ${u.replace('http://localhost:8000','').replace('http://localhost:3000','')}`);
  }
});
await page.goto('http://localhost:3000/bi-dashboard', { waitUntil: 'domcontentloaded' });
// wait specifically for project cards OR empty state, up to 30s
let cards = 0, sawEmpty = false;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(1000);
  cards = await page.locator('a[href^="/bi-dashboard/proj_"]').count();
  sawEmpty = await page.locator('text=/No BI Dashboard yet/i').count() > 0;
  if (cards > 0 || sawEmpty) break;
}
const featureGrid = await page.locator('text=/Chart Builder/i').count();
const firstCardNames = await page.locator('a[href^="/bi-dashboard/proj_"] h3').allInnerTexts().catch(()=>[]);
console.log('cards:', cards, '| emptyState:', sawEmpty, '| featureGrid:', featureGrid);
console.log('cardNames:', JSON.stringify(firstCardNames.slice(0,12)));
console.log('NETWORK:'); console.log([...new Set(calls)].join('\n'));
await page.screenshot({ path: '/Users/datalab360/Documents/data360_pro/datalab360Front/docs/product-readiness-audit/screens/qa/bi-dashboard.png', fullPage: true });
await browser.close();
