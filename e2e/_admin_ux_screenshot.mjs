import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __d = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__d, '..');
const outDir = path.join(root, 'docs/product-readiness-audit/screens/overnight');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: path.join(__d, '.auth/state.json'),
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();
await page.goto('http://localhost:3000/administration', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

const after = path.join(outDir, 'admin_ux_after.png');
await page.screenshot({ path: after, fullPage: false });
console.log('Saved:', after);

// Verify the vertical rail is present
const rail = await page.locator('[role="tablist"][aria-orientation="vertical"]').count();
console.log('Vertical tablist found:', rail);

const collapseBtn = page.locator('button[aria-label="Collapse navigation"]');
const cnt = await collapseBtn.count();
console.log('Collapse button count:', cnt);

if (cnt > 0) {
  await collapseBtn.click();
  await page.waitForTimeout(500);
  const collapsed = path.join(outDir, 'admin_ux_after_collapsed.png');
  await page.screenshot({ path: collapsed, fullPage: false });
  console.log('Saved:', collapsed);
}

await browser.close();
console.log('Done');
