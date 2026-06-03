// Live Chrome e2e: import each workflow template into the builder and drive the
// full lifecycle (save → validate → dry-run → clone-test → EXECUTE) on the HAHA
// account. Captures every /workflow|/cortex network call + status → evidence of
// which buttons hit real routes vs 404, plus screenshots per stage.
// User-authorized: clone + REAL execute on the HAHA CP_DATA360 sandbox.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = 'http://localhost:3000';
const SHOTS = 'e2e/workflow-e2e/shots';
const TPL = resolve('apps/data360/public/workflow-templates');
mkdirSync(SHOTS, { recursive: true });

const TEMPLATES = [
  ['ai-sentiment', `${TPL}/ai-sentiment-pipeline.json`],
  ['complex-etl', `${TPL}/complex-multisource-etl.json`],
  ['cdc-merge', `${TPL}/incremental-cdc-merge.json`],
  ['retail', `${TPL}/retail-business-pipeline.json`],
];
// Lifecycle buttons to try, by visible label/title (best-effort, resilient).
const STEPS = ['Save', 'Validate', 'Dry', 'Test', 'Clone', 'Deploy', 'Execute', 'Run'];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: 'e2e/.auth/state.json', viewport: { width: 1680, height: 1000 } });
const page = await ctx.newPage();
page.setDefaultTimeout(25000);

// --- network capture ---
const net = [];
page.on('response', (r) => {
  const u = new URL(r.url());
  if (u.origin !== BASE) return;
  if (!/\/(workflow|cortex|projects)\b|\/workflow\//.test(u.pathname)) return;
  net.push({ t: Date.now(), status: r.status(), method: r.request().method(), path: u.pathname + (u.search || '') });
});

// --- using saved HAHA session (e2e/.auth/state.json) ---
console.log('using saved HAHA session');

const report = [];
for (const [key, file] of TEMPLATES) {
  const rec = { template: key, stages: [], errors: [] };
  const before = net.length;
  try {
    await page.goto(`${BASE}/workflow`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${SHOTS}/${key}-01-land.png` }).catch(() => {});

    // The builder is gated by a mandatory project modal (WorkflowProjectGate):
    // a listbox of existing workflows (click a row → enter builder) or a New wizard.
    // Prefer selecting an existing workflow row (simplest path to the canvas).
    const row = page.locator('[role="listbox"] button, ul[aria-label*="workflow" i] button').first();
    if (await row.count() && await row.isVisible().catch(() => false)) {
      await row.click().catch(() => {});
      await page.waitForTimeout(3000); // builder loads the selected workflow
      rec.stages.push('entered-builder (selected existing workflow)');
    } else {
      rec.errors.push('no existing workflow row to select (gate may need wizard create)');
    }
    await page.screenshot({ path: `${SHOTS}/${key}-02-gate.png` }).catch(() => {});

    // Import the template via the hidden file input behind the Import button.
    const fileInput = page.locator('input[type="file"][accept*="json"]').first();
    if (await fileInput.count()) {
      await fileInput.setInputFiles(file).catch((e) => rec.errors.push('setInputFiles: ' + e.message.slice(0, 80)));
      await page.waitForTimeout(2500);
      rec.stages.push('imported');
      await page.screenshot({ path: `${SHOTS}/${key}-03-imported.png`, fullPage: true }).catch(() => {});
    } else {
      rec.errors.push('no JSON file input found (import button missing?)');
    }

    // Drive each lifecycle button that exists, capturing the network it fires.
    for (const step of STEPS) {
      const btn = page.getByRole('button', { name: new RegExp(step, 'i') }).first();
      if (await btn.count() && await btn.isVisible().catch(() => false) && await btn.isEnabled().catch(() => false)) {
        const n0 = net.length;
        await btn.click().catch(() => {});
        await page.waitForTimeout(3500); // let the call + toast resolve
        const fired = net.slice(n0).map((x) => `${x.status} ${x.method} ${x.path}`);
        rec.stages.push({ step, fired });
        await page.screenshot({ path: `${SHOTS}/${key}-step-${step.toLowerCase()}.png` }).catch(() => {});
      }
    }
  } catch (e) {
    rec.errors.push('NAV/FLOW: ' + e.message.slice(0, 140));
  }
  rec.network = net.slice(before).map((x) => `${x.status} ${x.method} ${x.path}`);
  report.push(rec);
  console.log(`\n=== ${key} ===\n  stages: ${JSON.stringify(rec.stages).slice(0, 300)}\n  net: ${rec.network.length} calls; 404s: ${rec.network.filter((s) => s.startsWith('404')).length}`);
}

writeFileSync('e2e/workflow-e2e/report.json', JSON.stringify(report, null, 2));
console.log('\nWROTE e2e/workflow-e2e/report.json');
await browser.close();
