import { chromium } from '@playwright/test';
const PASS = process.env.D360_PASS ?? '';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
await page.goto('http://localhost:3000/signin', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
await page.locator('input[name="account_name"]').first().fill('uchsfvb-HAHA');
await page.locator('input[name="username"]').first().fill('HAHA');
await page.locator('input[type="password"]').first().fill(PASS);
await page.locator('button[type="submit"]').first().click();
await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 120_000 });
console.log('signed in');
for (const route of ['/admin/performance', '/intelligent?tab=semantic-models', '/explore-design/catalog', '/workflow/dev-tools']) {
  await page.goto(`http://localhost:3000${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const url = page.url();
  const textLen = await page.evaluate(() => (document.querySelector('main') ?? document.body).innerText.length);
  const tabs = await page.locator('[role="tablist"] [role="tab"]').count();
  console.log(`${route} -> ${url.replace('http://localhost:3000', '')} textLen=${textLen} tabs=${tabs}`);
}
await browser.close();
