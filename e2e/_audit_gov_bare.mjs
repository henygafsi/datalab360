import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3001';
const errs = [], fail5xx = [], consoleErrs = [];

const ctxOpts = { storageState: 'e2e/.auth/state.json' };
const browser = await chromium.launch();
const context = await browser.newContext(ctxOpts);
const page = await context.newPage();

page.on('response', (r) => {
  const s = r.status();
  if (s >= 500) fail5xx.push(`${s} ${r.request().method()} ${r.url()}`);
});
page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));

await page.goto(`${BASE}/governance`, { waitUntil: 'networkidle', timeout: 90000 }).catch((e) => errs.push('goto: ' + e.message));
await page.waitForTimeout(6000);
await page.screenshot({ path: 'docs/product-readiness-audit/screens/module-green/governance_bare.png', fullPage: true });

const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';
const emptyMarkers = ['Could not load', 'Failed to load', 'Something went wrong', 'No data', 'Aucune donnée', 'Error loading'].filter((m) => bodyText.includes(m));

// Try to read a visible value to cross-check (compliance score / counts)
const snippet = bodyText.slice(0, 1500).replace(/\n+/g, ' | ');

console.log(JSON.stringify({
  url: page.url(),
  textLen: bodyText.length,
  emptyMarkers,
  fail5xx,
  consoleErrs: consoleErrs.slice(0, 15),
  pageErrs: errs,
  snippet,
}, null, 2));

await browser.close();
