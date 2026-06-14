// Live Chrome e2e — WorkflowSmartPanel Cost / Governance / Usage sections.
//
// Flow: /workflow → select an existing project via the mandatory gate
// ([role="listbox"] row) → the always-visible WorkflowSmartPanel right rail →
// click the Cost, Governance and Usage rail buttons → screenshot each into
// e2e/results/cost-gov/. (After the rail merge the former WorkflowProjectBar
// folded into this single panel; Runs→"Run history", History→"Deployments &
// versions" — Cost/Governance/Usage titles are unchanged.)
//
// Pass criteria per tab:
//   · no uncaught page exception (pageerror)
//   · no Next.js / React error boundary visible ("Application error", etc.)
//   · the panel shows a handled state: data, empty, "coming soon" (404/501
//     degrade) or a handled error row — never a blank crash.
// Console errors are captured and reported; plain 404 resource logs for the
// known not-yet-deployed endpoints (/command-center/projects/*/scores) are
// expected and listed separately, not failures.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.E2E_BASE || 'http://localhost:3000';
const STATE = process.env.E2E_STATE || 'e2e/.auth/state.json';
const OUT = 'e2e/results/cost-gov';
mkdirSync(OUT, { recursive: true });

const TABS = ['Cost', 'Governance', 'Usage'];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: STATE,
  viewport: { width: 1680, height: 1000 },
});
const page = await ctx.newPage();
page.setDefaultTimeout(25000);

// ── error capture ────────────────────────────────────────────────────────────
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (err) => pageErrors.push(String(err?.message || err)));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

// Network capture for the endpoints under test.
const net = [];
page.on('response', (r) => {
  try {
    const u = new URL(r.url());
    if (u.origin !== BASE) return;
    if (!/cost-summary|\/scores\b|\/runs\b|runs\/summary/.test(u.pathname)) return;
    net.push(`${r.status()} ${r.request().method()} ${u.pathname}${u.search || ''}`);
  } catch { /* ignore */ }
});

const report = { steps: [], tabs: {}, pageErrors, consoleErrors, network: net };
const fail = (msg) => { report.steps.push(`FAIL: ${msg}`); };
const step = (msg) => { report.steps.push(msg); console.log(`· ${msg}`); };

try {
  // 1 — land on /workflow (saved HAHA session). Dev-mode first compile can
  // transiently 404 → reload up to 3 times until the page actually renders.
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(`${BASE}/workflow`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    const notFound = await page
      .getByText(/Page not found/i).first().isVisible().catch(() => false);
    if (!notFound) break;
    step(`landing attempt ${attempt} hit a transient not-found — retrying`);
  }
  step('landed on /workflow');
  await page.screenshot({ path: `${OUT}/00-land.png` }).catch(() => {});

  // 2 — select an existing project through the mandatory gate
  const selectFromGate = async () => {
    const row = page.locator('[role="listbox"] button').first();
    await row.waitFor({ state: 'visible', timeout: 30000 });
    const rowName = (await row.locator('span').first().textContent().catch(() => null)) || '(unknown)';
    await row.click();
    step(`selected project from gate: ${rowName.trim()}`);
    // Let the builder load + the URL/project-context sync settle (the dev
    // server can fall back to a full browser navigation on RSC fetch).
    await page.waitForTimeout(4000);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);
  };
  await selectFromGate();
  await page.screenshot({ path: `${OUT}/01-builder.png` }).catch(() => {});

  // 3 — the WorkflowSmartPanel (single right rail, always-visible region) must
  // be mounted. After the rail merge the former WorkflowProjectBar folded into
  // this one panel; it is the [role="region"][aria-label="Workflow smart panel"].
  const bar = page.locator('[role="region"][aria-label="Workflow smart panel"]');
  const gateRow = page.locator('[role="listbox"] button').first();
  const ensureBuilder = async () => {
    // If a reload brought the mandatory gate back, pick the project again.
    if (!(await bar.isVisible().catch(() => false)) &&
        (await gateRow.isVisible().catch(() => false))) {
      await selectFromGate();
    }
    await bar.waitFor({ state: 'visible', timeout: 20000 });
  };
  await ensureBuilder();
  step('WorkflowSmartPanel rail visible');

  // 4 — click each tab, let its fetch settle, screenshot, assert handled state
  for (const label of TABS) {
    const errBefore = pageErrors.length;
    await ensureBuilder();
    const tab = bar.locator(`nav[aria-label="Workflow panel sections"] button[title="${label}"]`);
    await tab.waitFor({ state: 'visible', timeout: 15000 });
    await tab.click();
    // cost-summary can take a couple of seconds (warehouse attribution query)
    await page.waitForTimeout(5000);

    // The smart panel IS the region (always-visible), so the panel body lives
    // inside `bar` itself — read state from the whole region.
    const panel = bar;
    let panelVisible = await panel.isVisible().catch(() => false);
    if (!panelVisible) {
      // One retry — a mid-click reload or a toggle race can swallow the first
      // click (clicking the active tab closes the panel).
      await ensureBuilder();
      await tab.click().catch(() => {});
      await page.waitForTimeout(5000);
      panelVisible = await panel.isVisible().catch(() => false);
    }
    const panelText = panelVisible ? (await panel.innerText().catch(() => '')) : '';

    const shot = `${OUT}/tab-${label.toLowerCase()}.png`;
    await page.screenshot({ path: shot }).catch(() => {});

    // Unhandled-crash detection: error boundary copy or uncaught exception.
    const boundary = await page
      .getByText(/Application error|Something went wrong|Unhandled Runtime Error/i)
      .first()
      .isVisible()
      .catch(() => false);
    const newPageErrors = pageErrors.slice(errBefore);

    const state = !panelVisible
      ? 'panel-not-open'
      : /coming soon/i.test(panelText)
        ? 'graceful-coming-soon'
        : /No (cost|usage|runs|scores|attributed)/i.test(panelText)
          ? 'empty-state'
          : /Retry/i.test(panelText)
            ? 'handled-error-row'
            : 'data';

    const ok = panelVisible && !boundary && newPageErrors.length === 0;
    report.tabs[label] = { ok, state, boundary, newPageErrors, screenshot: shot, excerpt: panelText.slice(0, 400) };
    if (!ok) fail(`${label} tab — panelVisible=${panelVisible} boundary=${boundary} pageErrors=${JSON.stringify(newPageErrors)}`);
    step(`${label} tab → ${state}${ok ? '' : ' (FAILED)'}`);
  }
} catch (e) {
  fail(`flow: ${String(e?.message || e).slice(0, 300)}`);
  await page.screenshot({ path: `${OUT}/99-failure.png` }).catch(() => {});
}

// Split expected 404 logs (endpoints not deployed on this env) from the rest.
const expected404 = consoleErrors.filter((t) => /404/.test(t) && /scores|runs\/summary/.test(t));
const unexpectedConsole = consoleErrors.filter((t) => !expected404.includes(t));
report.expected404Console = expected404;
report.unexpectedConsole = unexpectedConsole;

const failed =
  report.steps.some((s) => s.startsWith('FAIL')) ||
  Object.values(report.tabs).some((t) => !t.ok) ||
  pageErrors.length > 0;

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log('\n=== network (endpoints under test) ===');
for (const n of net) console.log('  ' + n);
console.log('=== console errors ===');
console.log(`  expected 404 (not-deployed endpoints): ${expected404.length}`);
for (const c of unexpectedConsole) console.log('  ! ' + c.slice(0, 200));
console.log(`\n${failed ? 'RESULT: FAIL' : 'RESULT: PASS'} — report at ${OUT}/report.json`);
await browser.close();
process.exit(failed ? 1 : 0);
