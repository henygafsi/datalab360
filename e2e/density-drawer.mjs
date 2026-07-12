/** Open the Account tab's "All metrics" drawer and screenshot it. */
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
await page.goto('http://localhost:3000/account-overview', { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
await page.waitForTimeout(12_000);
await page.getByRole('button', { name: /More · All metrics/i }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: 'e2e/results/density-after-drawer-open.png' });
console.log('saved e2e/results/density-after-drawer-open.png');
await browser.close();
