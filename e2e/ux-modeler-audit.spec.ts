import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';

const PASS = process.env.D360_PASS ?? '';
const PROJECT = 'proj_120def6bd075'; // PERSONA_DE · Retail Model (DRAFT_SOURCE.RETAIL_DW)
test.setTimeout(20 * 60_000);

const OUT = 'e2e/results/ux-modeler';
fs.mkdirSync(OUT, { recursive: true });

type TabMetric = {
  view: string;
  scrollHeight: number;
  viewportH: number;
  scrollRatio: number;
  buttonCount: number;
  visibleButtonCount: number;
  failed4xx5xx: string[];
  notes: string[];
};

async function signIn(page: Page) {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 120_000 });
}

async function measure(page: Page, view: string, failures: string[]): Promise<TabMetric> {
  const m = await page.evaluate(() => {
    const main = document.querySelector('main') ?? document.body;
    const btns = Array.from(document.querySelectorAll('button'));
    const visible = btns.filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
    });
    return {
      scrollHeight: Math.max(main.scrollHeight, document.body.scrollHeight),
      viewportH: window.innerHeight,
      buttonCount: btns.length,
      visibleButtonCount: visible.length,
    };
  });
  return {
    view,
    ...m,
    scrollRatio: Math.round((m.scrollHeight / m.viewportH) * 100) / 100,
    failed4xx5xx: [...failures],
    notes: [],
  };
}

test('modeler UX audit: all tabs + right bar + inline adds on RETAIL_DW', async ({ page }) => {
  const allMetrics: TabMetric[] = [];
  const failures: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('_next') && !r.url().includes('favicon')) {
      failures.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
    }
  });

  await signIn(page);

  // ---- main tabs
  const views = ['catalog', 'modeling', 'lineage', 'quality', 'policies', 'insights'];
  for (const v of views) {
    failures.length = 0;
    await page.goto(`/explore-design?project_id=${PROJECT}&view=${v}`);
    await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/tab-${v}.png`, fullPage: true });
    const metric = await measure(page, `tab:${v}`, failures);
    // count options inside the central area for modeling specifically
    if (v === 'modeling') {
      const central = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, [role="menuitem"]')).map(
          (b) => (b.textContent ?? '').trim(),
        ).filter((t) => t.length > 0 && t.length < 60);
        return btns;
      });
      metric.notes.push(`modeling visible labeled controls: ${central.length}`);
      fs.writeFileSync(`${OUT}/modeling-controls.json`, JSON.stringify(central, null, 1));
    }
    allMetrics.push(metric);
  }

  // ---- right bar sections (from catalog view)
  failures.length = 0;
  await page.goto(`/explore-design?project_id=${PROJECT}&view=catalog`);
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const rightTabs = ['actions', 'ai', 'quality', 'cost', 'governance', 'deploy', 'history', 'help'];
  for (const rt of rightTabs) {
    failures.length = 0;
    // right bar tabs are icon buttons; try title/aria based selectors then text
    const sel = page
      .locator(
        `[data-right-tab="${rt}"], button[title*="${rt}" i], button[aria-label*="${rt}" i]`,
      )
      .first();
    let clicked = false;
    if (await sel.isVisible().catch(() => false)) {
      await sel.click().catch(() => {});
      clicked = true;
    } else {
      const byText = page.getByRole('button', { name: new RegExp(rt, 'i') }).first();
      if (await byText.isVisible().catch(() => false)) {
        await byText.click().catch(() => {});
        clicked = true;
      }
    }
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${OUT}/rightbar-${rt}.png`, fullPage: false });
    const metric = await measure(page, `rightbar:${rt}`, failures);
    metric.notes.push(clicked ? 'clicked' : 'SELECTOR NOT FOUND');
    allMetrics.push(metric);
  }

  // ---- schema view: select DRAFT_SOURCE.RETAIL_DW, look at catalog sub-tabs + inline adds
  failures.length = 0;
  await page.goto(`/explore-design?project_id=${PROJECT}&view=catalog`);
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // click a table in the source rail if present (DIM_CLIENTS)
  const tableRow = page.getByText('DIM_CLIENTS', { exact: false }).first();
  if (await tableRow.isVisible().catch(() => false)) {
    await tableRow.click().catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/table-selected.png`, fullPage: true });
    allMetrics.push(await measure(page, 'catalog:table-selected(DIM_CLIENTS)', failures));

    // walk catalog sub-tabs
    for (const st of ['Overview', 'Columns', 'Data Preview', 'Preview', 'Lineage', 'Quality', 'History']) {
      const stBtn = page.getByRole('button', { name: new RegExp(`^${st}`, 'i') }).first();
      if (await stBtn.isVisible().catch(() => false)) {
        failures.length = 0;
        await stBtn.click().catch(() => {});
        await page.waitForTimeout(2000);
        await page.screenshot({ path: `${OUT}/subtab-${st.toLowerCase().replace(/ /g, '-')}.png`, fullPage: true });
        allMetrics.push(await measure(page, `subtab:${st}`, failures));
      }
    }
  } else {
    allMetrics.push({ view: 'catalog:table-select', scrollHeight: 0, viewportH: 0, scrollRatio: 0, buttonCount: 0, visibleButtonCount: 0, failed4xx5xx: [], notes: ['DIM_CLIENTS row not visible in source rail'] });
  }

  fs.writeFileSync(`${OUT}/metrics.json`, JSON.stringify(allMetrics, null, 1));
  console.log(JSON.stringify(allMetrics, null, 1));
  expect(true).toBe(true);
});
