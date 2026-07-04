// Success-path verification: populated dashboard → docked drill-through with
// rows + AI Build generating real widgets onto the grid with the review list.
import { chromium } from '@playwright/test';

const OUT = '/Users/datalab360/.claude/jobs/7696d9e1/tmp/bibar';
const BASE = 'http://localhost:3000';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: 'e2e/.auth/state.json',
  viewport: { width: 1720, height: 1000 },
});
const page = await ctx.newPage();

await page.goto(`${BASE}/bi-dashboard`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
const hrefs = await page.locator('a[href^="/bi-dashboard/"]').evaluateAll(
  (as) => as.map((a) => a.getAttribute('href')),
);
console.log('cards:', hrefs.length);

// Find a dashboard whose page actually has widgets (drill button present).
let found = null;
for (const href of hrefs) {
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  const drillCount = await page.locator('button[aria-label="Drill through"]').count();
  const table = await page
    .locator('a[title^="Open"], [data-dashboard-grid]')
    .first()
    .isVisible()
    .catch(() => false);
  console.log(href, 'drill buttons:', drillCount, 'grid:', table);
  if (drillCount > 0) { found = href; break; }
}
if (!found) { console.log('no populated dashboard found'); await browser.close(); process.exit(1); }

// Drill-through → docked Data section with rows
await page.locator('button[aria-label="Drill through"]').first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/10-drill-docked-form.png` });
const run = page.getByRole('button', { name: 'Run drill-through' });
if (await run.isEnabled().catch(() => false)) {
  await run.click();
  await page.waitForTimeout(12000);
}
await page.screenshot({ path: `${OUT}/11-drill-docked-rows.png` });

// Grab the widget's table name for a grounded AI prompt.
const srcLabel = await page
  .locator('[aria-label="BI dashboard smart panel"] h3')
  .first()
  .textContent()
  .catch(() => '');
console.log('drill header:', srcLabel);

// AI Build with an explicit table-ish prompt
await page.locator('nav[aria-label="BI panel sections"] button[aria-label="AI Build"]').click();
await page.waitForTimeout(800);
const tableName = await page.evaluate(() => {
  const el = document.querySelector('[aria-label="BI dashboard smart panel"]');
  return el ? '' : '';
});
const prompt = 'total amount by region from FACT_TRANSACTIONS, and count of transactions by month';
await page.locator('#ai-build-prompt').fill(prompt);
await page.getByRole('button', { name: /Generate on the grid|Refine/ }).click();
await page.waitForTimeout(45000);
await page.screenshot({ path: `${OUT}/12-ai-build-populated.png` });
// scroll bar body to show review list if present
const review = await page.getByText('Created this session').count();
console.log('review list present:', review > 0);

await browser.close();
console.log('DONE', found);
