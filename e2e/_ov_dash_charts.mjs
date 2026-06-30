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

// Go to landing, find all dashboard links, then try one with 'SEED' or 'RETAIL' or 'SAMPLE'
const apiCalls = [];
page.on('response', async (resp) => {
  if (resp.url().includes('/api-proxy/bi')) {
    try { apiCalls.push({ url: resp.url(), status: resp.status() }); } catch {}
  }
});

await page.goto(`${BASE_URL}/bi-dashboard`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2500);

const links = await page.locator('a[href*="bi-dashboard/proj_"]').all();
console.log('All dashboard links:');
const hrefs = [];
for (const l of links) {
  const href = await l.getAttribute('href');
  const text = await l.textContent().catch(() => '');
  console.log(' ', href, '->', text.trim().replace(/\s+/g, ' ').substring(0, 60));
  hrefs.push(href);
}

// Try the SEED_DASH_COSTS or RETAIL_DW or SAMPLE dashboard (3rd or later)
const seedHref = hrefs.find(h => h) || hrefs[2];
console.log('\nNavigating to:', seedHref);
if (seedHref) {
  // Try 4th dashboard (index 3) which should be SEED_DASH_COSTS or similar
  const targetHref = hrefs[3] || hrefs[0];
  await page.goto(`${BASE_URL}${targetHref}`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${SCREENS_DIR}/11_seeded-dashboard.png` });

  const widgetCount = await page.locator('[class*="widget"], [class*="Widget"], [class*="GridChart"]').count();
  const canvasCount = await page.locator('canvas').count();
  const rechartsCount = await page.locator('[class*="recharts"], svg[class*="recharts"]').count();
  const headerText = await page.locator('h1, h2, [class*="breadcrumb"]').first().textContent().catch(() => '');
  const badgeText = await page.evaluate(() => {
    const el = document.querySelector('[class*="badge"], [class*="status"]');
    return el ? el.textContent : '';
  });

  console.log('\nDashboard details:');
  console.log('  Header:', headerText.trim());
  console.log('  Widgets:', widgetCount);
  console.log('  Canvas elements:', canvasCount);
  console.log('  Recharts SVG:', rechartsCount);
  console.log('  API calls for bi:', apiCalls.slice(0, 10).map(c => `${c.status} ${c.url.split('/api-proxy/')[1]}`).join(', '));

  // Check the page text for widget info
  const bodyText = await page.evaluate(() => document.body.innerText);
  const widgetLine = bodyText.split('\n').find(l => l.includes('widget') || l.includes('Widget'));
  console.log('  Widget line:', widgetLine);

  // Check for Curated Templates vs actual charts
  const templates = await page.locator('text=/Curated Templates/i').count();
  const aiPrompt = await page.locator('text=/Ask AI to build/i').count();
  console.log('  Shows Curated Templates (empty state):', templates > 0);
  console.log('  Shows AI prompt bar:', aiPrompt > 0);

  // Try scrolling to check for charts
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SCREENS_DIR}/12_seeded-dashboard-scrolled.png` });
}

await browser.close();
console.log('\nDone.');
