/**
 * Flow audit pass 2: scroll the right detail panel to capture
 * KpiLifecycle, Recommendations, and ProductActivity.
 */
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE = 'http://localhost:3000';
const STORAGE = 'e2e/.auth/state.json';
const SCREEN_DIR = 'docs/product-readiness-audit/screens/data-products';
const TIMEOUT = 90_000;
fs.mkdirSync(SCREEN_DIR, { recursive: true });

const log = (m) => console.log(m);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: STORAGE,
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();

const networkErrors = [];
const console4xx = [];
page.on('response', (r) => {
  const url = r.url().replace(BASE, '').split('?')[0];
  const s = r.status();
  if (s >= 500) networkErrors.push(`${s} ${url}`);
  else if (s >= 400 && !/(\.png|\.ico|\.svg|\.woff|favicon)/.test(url))
    console4xx.push(`${s} ${url}`);
});

async function shot(name) {
  const p = path.join(SCREEN_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  log(`[screenshot] ${p}`);
}

// Navigate and wait
await page.goto(`${BASE}/data-products`, { waitUntil: 'networkidle', timeout: TIMEOUT });
await page.waitForTimeout(3000);

// Open first product detail
const detailBtns = page.locator('button:has-text("Details")');
await detailBtns.first().click({ force: true });
await page.waitForTimeout(3000);

// The right panel has class overflow-y-auto — find it
const rightPanel = page.locator('.w-\\[380px\\].overflow-y-auto, [class*="w-\\[380px\\]"]').first();
log(`Right panel found: ${await rightPanel.count() > 0}`);

// Scroll the right panel using its selector
const scrollResult = await page.evaluate(() => {
  // Try multiple selectors for the right panel
  const selectors = [
    '.overflow-y-auto[class*="w-[380px]"]',
    '[class*="380px"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      el.scrollTop = 400;
      return `scrolled via ${sel}, scrollTop=${el.scrollTop}`;
    }
  }
  // Try the last overflow-y-auto element
  const all = [...document.querySelectorAll('.overflow-y-auto')];
  if (all.length > 0) {
    const last = all[all.length - 1];
    last.scrollTop = 400;
    return `scrolled last overflow-y-auto, scrollTop=${last.scrollTop}, total=${all.length}`;
  }
  return 'no scroll target found';
});
log(`Scroll result: ${scrollResult}`);
await page.waitForTimeout(1500);
await shot('p2_01_right_panel_scrolled_1');

// Scroll more
await page.evaluate(() => {
  const all = [...document.querySelectorAll('.overflow-y-auto')];
  if (all.length > 0) all[all.length - 1].scrollTop = 800;
});
await page.waitForTimeout(1000);
await shot('p2_02_right_panel_scrolled_2');

// Scroll even more to see ProductActivityPanel
await page.evaluate(() => {
  const all = [...document.querySelectorAll('.overflow-y-auto')];
  if (all.length > 0) all[all.length - 1].scrollTop = 1200;
});
await page.waitForTimeout(1000);
await shot('p2_03_right_panel_scrolled_3');

// Check what text is visible in the panel now
const panelText = await page.evaluate(() => {
  const all = [...document.querySelectorAll('.overflow-y-auto')];
  if (all.length > 0) {
    return all[all.length - 1].textContent?.slice(0, 800) || '';
  }
  return '';
});
log(`Right panel text content (first 800 chars): ${panelText.replace(/\s+/g, ' ').trim()}`);

// Check for KPI section h4
const kpiH4 = await page.locator('h4:has-text("KPI")').count();
const recoH4 = await page.locator('h4:has-text("Recommendations")').count();
const activityH4 = await page.locator('h4:has-text("Activity"), h4:has-text("Timeline")').count();
log(`KPI h4 count: ${kpiH4}, Reco h4: ${recoH4}, Activity h4: ${activityH4}`);

// Now use fullPage screenshot to capture entire right panel content
const fullShot = path.join(SCREEN_DIR, 'p2_04_fullpage.png');
await page.screenshot({ path: fullShot, fullPage: true });
log(`[screenshot] ${fullShot}`);

// Check subscribe button states in detail
const subscribeBtns = page.locator('button:has-text("Subscribe")');
const allSubData = await subscribeBtns.evaluateAll((btns) =>
  btns.map((b) => ({
    disabled: b.disabled,
    title: b.getAttribute('title'),
    text: b.textContent?.trim(),
  }))
);
log(`Subscribe buttons: ${JSON.stringify(allSubData)}`);

// Check Publish gate text/score details
const publishGateText = await page.locator('div:has(h4:has-text("Publish gate"))').first().textContent().catch(() => '');
log(`Publish gate text: ${publishGateText?.replace(/\s+/g, ' ').trim().slice(0, 200)}`);

// Check network errors
log(`Network 5xx: ${JSON.stringify(networkErrors)}`);
log(`Network 4xx: ${JSON.stringify(console4xx)}`);

await browser.close();
