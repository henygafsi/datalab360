import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname2 = path.dirname(fileURLToPath(import.meta.url));

const AUTH_STATE = 'e2e/.auth/state.json';
const BASE_URL = 'http://localhost:3000';
const SCREENS_DIR = 'docs/product-readiness-audit/screens/overnight/dashboards';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: AUTH_STATE,
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();

// Capture API calls
const apiCalls = [];
page.on('response', async (resp) => {
  if (resp.url().includes('/api-proxy') || resp.url().includes('api.datalab360')) {
    let body = null;
    try { body = await resp.json(); } catch {}
    apiCalls.push({ url: resp.url(), status: resp.status(), hasData: body !== null });
  }
});

await page.goto(`${BASE_URL}/bi-dashboard`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
await page.waitForTimeout(4000);

// Count structural elements
const roundedCards = await page.locator('.rounded-xl').count();
const bodyText = await page.evaluate(() => document.body.innerText);
const hasScoreLabels = bodyText.includes('DQ') || bodyText.includes('COST') || bodyText.includes('PERF') || bodyText.includes('GOV');
const hasDash = (bodyText.match(/—/g) || []).length; // em-dash placeholder "—"

console.log('Rounded-xl cards:', roundedCards);
console.log('Has ScoreCards dimension labels (DQ/COST/PERF/GOV):', hasScoreLabels);
console.log('Em-dash placeholders (—):', hasDash);
console.log('\nTop body text (first 500 chars):');
console.log(bodyText.substring(0, 500));
console.log('\nAPI calls:');
apiCalls.slice(0, 30).forEach(c => console.log(' ', c.status, c.url.replace('http://localhost:3000', '')));

await page.screenshot({ path: `${SCREENS_DIR}/10_scorecards-detailed.png` });
await browser.close();
