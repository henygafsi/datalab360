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

// Try SAMPLE · Finance & Returns (index 5 = proj_fc320437d42a)
// and RETAIL_DW Auto Dashboard (index 7 = proj_f5ba1dffb392)
const candidates = [
  { id: 'proj_fc320437d42a', name: 'SAMPLE Finance & Returns' },
  { id: 'proj_f5ba1dffb392', name: 'RETAIL_DW Auto Dashboard' },
  { id: 'proj_9d4d7bbc7b4c', name: 'SAMPLE Retail Sales Overview' },
];

for (const c of candidates) {
  console.log(`\n--- ${c.name} ---`);
  const apiCalls = [];
  page.on('response', async (resp) => {
    if (resp.url().includes('/api-proxy/bi')) {
      apiCalls.push({ url: resp.url().split('/api-proxy/')[1], status: resp.status() });
    }
  });

  await page.goto(`${BASE_URL}/bi-dashboard/${c.id}`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3500);

  const widgetLine = await page.evaluate(() => {
    const b = document.body.innerText;
    const l = b.split('\n').find(x => x.includes('widget') || x.includes('Widget'));
    return l || '';
  });
  const templates = await page.locator('text=/Curated Templates/i').count();
  const canvases = await page.locator('canvas').count();
  const svgCharts = await page.locator('svg[class*="recharts"], [class*="recharts-wrapper"]').count();
  const widgetDivs = await page.locator('[class*="GridChartCard"], [class*="widget-card"], [class*="widgetCard"]').count();

  console.log('  Widget line:', widgetLine.trim());
  console.log('  Shows Curated Templates:', templates > 0);
  console.log('  Canvas count:', canvases);
  console.log('  Recharts SVG count:', svgCharts);
  console.log('  Widget divs:', widgetDivs);
  console.log('  API calls:', apiCalls.map(x => `${x.status} ${x.url}`).join(', '));

  const filename = `${SCREENS_DIR}/13_${c.id.slice(-6)}.png`;
  await page.screenshot({ path: filename });
  console.log('  Screenshot:', filename);

  // Scroll to see full content
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(1000);
  const filename2 = `${SCREENS_DIR}/14_${c.id.slice(-6)}_scroll.png`;
  await page.screenshot({ path: filename2 });

  // Remove listener before next iteration
  page.removeAllListeners('response');
}

await browser.close();
console.log('\nDone.');
