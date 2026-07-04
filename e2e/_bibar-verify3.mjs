import { chromium } from '@playwright/test';
const OUT = '/Users/datalab360/.claude/jobs/7696d9e1/tmp/bibar';
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: 'e2e/.auth/state.json', viewport: { width: 1720, height: 1000 } });
const page = await ctx.newPage();
await page.goto('http://localhost:3000/bi-dashboard/proj_7164c2e6bd1d', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
// expand if collapsed
const collapsedNav = page.locator('nav[aria-label="BI panel sections (collapsed)"]');
if (await collapsedNav.count()) {
  await collapsedNav.locator('button[aria-label="AI Build"]').click();
} else {
  await page.locator('nav[aria-label="BI panel sections"] button[aria-label="AI Build"]').click();
}
await page.waitForTimeout(1000);
await page.locator('#ai-build-prompt').fill('sum of DURATION_MS by MODULE_NAME from table PROJECT_EVENTS');
await page.getByRole('button', { name: /Generate on the grid|Refine/ }).click();
await page.waitForTimeout(40000);
const review = await page.getByText('Created this session').count();
console.log('review list present:', review > 0);
await page.screenshot({ path: `${OUT}/13-ai-build-success.png` });
await browser.close();
console.log('DONE');
