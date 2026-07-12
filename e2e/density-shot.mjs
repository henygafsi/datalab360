/**
 * density-shot — before/after evidence for the Account-tab KPI density
 * redesign (2026-07). Signs in, opens /account-overview (Account tab),
 * shoots 1920x1080 + 1440x900 into e2e/results/density-<tag>-<w>x<h>.png.
 *
 * Usage: D360_PASS=... node e2e/density-shot.mjs <tag>   (tag = before|after)
 */
import { chromium } from '@playwright/test';

const TAG = process.argv[2] || 'shot';
const PASS = process.env.D360_PASS ?? '';
if (!PASS) {
  console.error('D360_PASS missing');
  process.exit(1);
}
const BASE = 'http://localhost:3000';
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
];

const browser = await chromium.launch();
try {
  let storageState;
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: vp, storageState });
    const page = await ctx.newPage();
    if (!storageState) {
      // sign in once (same selectors as tabs-validation.spec.ts); the extra
      // settle wait covers next-dev cold compile before hydration.
      await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000);
      await page.locator('input[name="account_name"]').first().fill('uchsfvb-HAHA');
      await page.locator('input[name="username"]').first().fill('HAHA');
      await page.locator('input[type="password"]').first().fill(PASS);
      await page.locator('button[type="submit"]').first().click();
      await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 120_000 });
      storageState = await ctx.storageState();
    }
    await page.goto(`${BASE}/account-overview`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
    // let the slow first fetches (summary / overview-kpis / module-health) land
    await page.waitForTimeout(15_000);
    const out = `e2e/results/density-${TAG}-${vp.width}x${vp.height}.png`;
    await page.screenshot({ path: out, fullPage: true });
    console.log(`saved ${out}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
