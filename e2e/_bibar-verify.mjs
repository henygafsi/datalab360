// Verify the bi-dashboard docked right-bar work: (a) auto-opened default view,
// (b) Add section, (c) AI Build with widgets on grid + review list.
// Screenshots → /Users/datalab360/.claude/jobs/7696d9e1/tmp/bibar/
import { chromium } from '@playwright/test';

const OUT = '/Users/datalab360/.claude/jobs/7696d9e1/tmp/bibar';
const BASE = 'http://localhost:3000';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: 'e2e/.auth/state.json',
  viewport: { width: 1720, height: 1000 },
});
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });

// 1) Landing — find a dashboard card
await page.goto(`${BASE}/bi-dashboard`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/00-landing.png` });

const cards = page.locator('a[href^="/bi-dashboard/"]');
const n = await cards.count();
console.log('dashboard cards:', n);
if (n === 0) { console.log('NO DASHBOARDS — stopping'); await browser.close(); process.exit(1); }
const href = await cards.first().getAttribute('href');
console.log('opening', href);

// 2) Editor — auto-opened bar default view (overview)
await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
await page.screenshot({ path: `${OUT}/01-editor-bar-default.png`, fullPage: false });
const barVisible = await page.locator('[aria-label="BI dashboard smart panel"]').isVisible().catch(() => false);
console.log('bar visible:', barVisible);
if (!barVisible) {
  // maybe collapsed — expand
  const expand = page.locator('button[aria-label="Expand panel"]');
  if (await expand.count()) { await expand.click(); await page.waitForTimeout(800); }
}
// Force the Configure section (default overview lives there when nothing selected)
await page.locator('nav[aria-label="BI panel sections"] button[aria-label="Configure widget"]').click().catch(() => {});
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/02-bar-overview.png` });

// 3) Add section via the rail
await page.locator('nav[aria-label="BI panel sections"] button[aria-label="Add widgets & templates"]').click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/03-bar-add-widgets.png` });
// Templates sub-tab
await page.getByRole('tab', { name: 'Templates' }).click().catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/04-bar-add-templates.png` });

// Tile → docked Configure form
await page.getByRole('tab', { name: 'Widgets' }).click().catch(() => {});
await page.waitForTimeout(500);
await page.locator('[aria-label="BI dashboard smart panel"] button[title="Bar"]').first().click().catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/05-bar-configure-from-add.png` });

// 4) AI Build section
await page.locator('nav[aria-label="BI panel sections"] button[aria-label="AI Build"]').click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/06-bar-ai-build-empty.png` });
const promptBox = page.locator('#ai-build-prompt');
if (await promptBox.count()) {
  await promptBox.fill('total rows by region');
  await page.getByRole('button', { name: /Generate on the grid|Refine/ }).click();
  // generation can be slow on a cold backend
  await page.waitForTimeout(25000);
  await page.screenshot({ path: `${OUT}/07-bar-ai-build-result.png` });
} else {
  console.log('AI Build prompt box not found (unavailable state?)');
  await page.screenshot({ path: `${OUT}/07-bar-ai-build-state.png` });
}

// 5) Drill-through Data section (empty state at least)
await page.locator('nav[aria-label="BI panel sections"] button[aria-label="Drill-through data"]').click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/08-bar-data-section.png` });

// 6) Landing AI Build rail
await page.goto(`${BASE}/bi-dashboard`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
await page.getByRole('button', { name: 'AI Build' }).first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/09-landing-ai-build-rail.png` });

await browser.close();
console.log('DONE');
