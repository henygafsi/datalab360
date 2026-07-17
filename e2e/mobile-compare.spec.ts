import { test, expect } from '@playwright/test';
import * as path from 'path';
const STATE = path.join(__dirname, 'night-audit-artifacts', '.auth.json');
test.use({ storageState: STATE, viewport: { width: 390, height: 844 } });
test('mobile: no horizontal overflow on intelligent + governance', async ({ page }) => {
  await page.goto('/intelligent', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const iWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.screenshot({ path: 'e2e/agentic-os-artifacts/mobile-intelligent-fixed.png' });
  await page.goto('/governance', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const gWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  console.log(`SCROLLWIDTH intelligent=${iWidth} governance=${gWidth} viewport=390`);
  expect(iWidth, 'intelligent must not overflow').toBeLessThanOrEqual(400);
});
