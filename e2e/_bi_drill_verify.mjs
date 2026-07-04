import { chromium } from '@playwright/test';

const SHOT = '/Users/datalab360/.claude/jobs/7696d9e1/tmp/biui';
const BASE = 'http://localhost:3000';
const log = (...a) => console.log('[bi-verify]', ...a);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: 'e2e/.auth/state.json',
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();

async function openEditor(href) {
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const bar = page.locator('[aria-label="BI dashboard smart panel"]');
  await bar.waitFor({ state: 'visible', timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(5000); // widgets auto-fetch/render
}

try {
  // Landing → collect all dashboard hrefs
  await page.goto(`${BASE}/bi-dashboard`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('a[href^="/bi-dashboard/"]').first()
    .waitFor({ state: 'visible', timeout: 45000 }).catch(() => log('no cards in 45s'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT}/verify_01_landing.png` });
  const hrefs = await page.locator('a[href^="/bi-dashboard/"]').evaluateAll(
    (els) => [...new Set(els.map((e) => e.getAttribute('href')).filter(Boolean))],
  );
  log('dashboards found:', hrefs.length, hrefs.slice(0, 8).join(', '));

  // Find a dashboard that has a drill-capable widget (chart/table with a table)
  let drillHref = null;
  let firstEditorShot = false;
  for (const href of hrefs.slice(0, 8)) {
    await openEditor(href);
    if (!firstEditorShot) {
      // Capture the auto-open overview default (nothing selected) on the first editor
      const ov = await page.getByText('Dashboard overview', { exact: false }).count().catch(() => 0);
      log('overview default visible on', href, '?', ov > 0);
      await page.screenshot({ path: `${SHOT}/verify_02_editor_overview.png` });
      firstEditorShot = true;
    }
    const drill = page.locator('button[aria-label="Drill through"]');
    // action buttons may be hover-revealed → hover the first grid card
    const gridCards = page.locator('[data-dashboard-grid] [aria-label="Configure widget"]');
    const nWidgets = await gridCards.count();
    log(`  ${href}: config-buttons=${nWidgets}, drill-buttons=${await drill.count()}`);
    if (await drill.count()) { drillHref = href; break; }
    // try hovering to reveal
    if (nWidgets > 0) {
      await gridCards.first().hover().catch(() => {});
      await page.waitForTimeout(500);
      if (await drill.count()) { drillHref = href; break; }
    }
  }

  if (!drillHref) { log('NO drill-capable dashboard found in first 8'); }
  else {
    log('drill-capable dashboard:', drillHref);
    await openEditor(drillHref);

    // Select a widget → config in bar
    const cfg = page.locator('[data-dashboard-grid] [aria-label="Configure widget"]').first();
    if (await cfg.count()) {
      await cfg.click({ force: true });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${SHOT}/verify_03_config_in_bar.png` });
      log('config-in-bar captured');
    }

    // Drill-through → renders in bar's Data section (no popup)
    const drill = page.locator('button[aria-label="Drill through"]').first();
    await drill.click({ force: true });
    await page.waitForTimeout(1200);
    const runBtn = page.getByRole('button', { name: /Run drill-through/i }).first();
    if (await runBtn.count()) {
      await runBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(4000);
    }
    await page.screenshot({ path: `${SHOT}/verify_04_drill_in_bar.png` });
    // Assertions: bar shows drill; NO legacy fixed portal drawer present
    const inBar = await page.locator('[aria-label="BI dashboard smart panel"]')
      .getByText(/Drill-through/i).count().catch(() => 0);
    const portal = await page.locator('div.fixed.inset-y-0.right-0.z-\\[70\\]').count();
    log('drill header inside bar?', inBar > 0, '| legacy z-70 portal count:', portal);
  }
  log('DONE');
} catch (e) {
  log('ERROR', e.message);
  await page.screenshot({ path: `${SHOT}/verify_ERR.png` }).catch(() => {});
} finally {
  await browser.close();
}
