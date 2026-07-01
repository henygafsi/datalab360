import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
const __d = path.dirname(fileURLToPath(import.meta.url));

const SCREENS_DIR = 'docs/product-readiness-audit/screens/overnight/dashboards';
const BASE_URL = 'http://localhost:3000';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: 'e2e/.auth/state.json',
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();

const apiCalls = [];
page.on('response', async (resp) => {
  if (resp.url().includes('/api-proxy/bi') || resp.url().includes('/api-proxy/command-center')) {
    let body = null;
    try { body = await resp.json(); } catch {}
    apiCalls.push({ url: resp.url().split('/api-proxy/')[1], status: resp.status(), hasData: !!body });
  }
});

// SAMPLE · Finance & Returns
const projectId = 'proj_fc320437d42a';
console.log(`\nLoading SAMPLE · Finance & Returns (${projectId})`);
await page.goto(`${BASE_URL}/bi-dashboard/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});

// Wait longer for API responses
await page.waitForTimeout(8000);

const canvases = await page.locator('canvas').count();
const rechartsWrappers = await page.locator('[class*="recharts-wrapper"], [class*="recharts-surface"]').count();
const svgInsideDiv = await page.locator('div > svg').count();
const allSvg = await page.locator('svg').count();
const skeletons = await page.locator('[class*="skeleton"], [class*="animate-pulse"], .animate-pulse').count();

const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 800));
const widgetLine = bodyText.split('\n').find(l => l.includes('widget'));
const headerText = bodyText.split('\n').slice(0, 5).join(' | ');

console.log('  Header text:', headerText);
console.log('  Widget line:', widgetLine);
console.log('  Canvas count:', canvases);
console.log('  Recharts wrappers:', rechartsWrappers);
console.log('  SVG inside div:', svgInsideDiv);
console.log('  All SVG:', allSvg);
console.log('  Skeletons:', skeletons);

await page.screenshot({ path: `${SCREENS_DIR}/15_finance-returns-loaded.png` });
console.log('  Screenshot saved.');

// Scroll down to see charts
await page.evaluate(() => window.scrollTo(0, 400));
await page.waitForTimeout(1000);
await page.screenshot({ path: `${SCREENS_DIR}/16_finance-returns-scrolled.png` });

console.log('\n  API calls:');
apiCalls.forEach(c => console.log(`   ${c.status} ${c.url}`));

await browser.close();
