import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE = 'http://localhost:3000';
const STORAGE = 'e2e/.auth/state.json';
const SCREEN_DIR = 'docs/product-readiness-audit/screens/data-products';
fs.mkdirSync(SCREEN_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: STORAGE,
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();

const network4xx = [];
page.on('response', (r) => {
  const s = r.status();
  if (s >= 400 && s < 500) {
    network4xx.push(`${s} ${r.url().replace(BASE,'').split('?')[0]}`);
  }
});

await page.goto(`${BASE}/data-products`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.waitForTimeout(3000);
await page.locator('button:has-text("Details")').first().click({ force: true });
await page.waitForTimeout(3500);

// Scroll right panel to see Activity
await page.evaluate(() => {
  const el = document.querySelector('.overflow-y-auto[class*="w-[380px]"]');
  if (el) el.scrollTop = 1800;
});
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(SCREEN_DIR, 'p2_05_activity_panel.png') });
console.log('[screenshot] p2_05_activity_panel.png');

// Check what text is visible at the bottom
const txt = await page.evaluate(() => {
  const el = document.querySelector('.overflow-y-auto[class*="w-[380px]"]');
  return el ? el.textContent : 'not found';
});
console.log('Full panel text:', txt?.replace(/\s+/g, ' ').trim().slice(-800));

// Now test subscribe buttons - check the tooltip/title attribute on cards
// The "Retail Transactions (RLS)" product - try clicking subscribe to see any gate message
const productCards = page.locator('.rounded-xl.border.cursor-pointer');
const cardCount = await productCards.count();
console.log(`Product cards: ${cardCount}`);

// Print all subscribe button states with their parent product name
for (let i = 0; i < cardCount; i++) {
  const card = productCards.nth(i);
  const name = await card.locator('h3').first().textContent().catch(() => '?');
  const subBtn = card.locator('button:has-text("Subscribe")');
  if (await subBtn.count() > 0) {
    const disabled = await subBtn.isDisabled();
    const title = await subBtn.getAttribute('title');
    console.log(`[${name}] Subscribe disabled=${disabled}, title="${title}"`);
  }
}

// Also check the "Retail Transactions (RLS)" product - click Details to see if it differs
const retailCard = page.locator('.rounded-xl.border.cursor-pointer').filter({ hasText: 'Retail Transactions' });
if (await retailCard.count() > 0) {
  await retailCard.locator('button:has-text("Details")').click({ force: true });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREEN_DIR, 'p2_06_retail_rls_detail.png') });
  console.log('[screenshot] p2_06_retail_rls_detail.png');

  // Get publishGate state for this product
  await page.evaluate(() => {
    const el = document.querySelector('.overflow-y-auto[class*="w-[380px]"]');
    if (el) el.scrollTop = 0;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREEN_DIR, 'p2_07_retail_rls_gate.png') });
  console.log('[screenshot] p2_07_retail_rls_gate.png');
}

console.log(`Network 4xx: ${JSON.stringify(network4xx)}`);
await browser.close();
