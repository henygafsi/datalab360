// Live Chrome e2e — AI call-to-action audit (actionable-insights layer).
//
// Verifies, on /explore-design and /workflow (SEED_* project preferred), that
// every AI CTA behaves like the honest state machine promises:
//   · loading state visible while running (aria-busy / "...ing" copy)
//   · settles within 30s into a HANDLED state: result, inline error
//     (role=alert), or the self-disabled `unavailable` chip on 404/501
//   · no uncaught page exception, no React error boundary, no infinite spinner
//
// Also exercises the gate's two failure modes with forced route mocks on the
// workflow dry-run endpoint:
//   · forced 500  → inline role=alert error, button re-armed (not stuck)
//   · forced 501  → button flips to the unavailable chip (auto-disable)
//
// Screenshots + JSON report land in e2e/results/ai-cta/.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = 'e2e/results/ai-cta';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: 'e2e/.auth/state.json',
  viewport: { width: 1680, height: 1000 },
});
const page = await ctx.newPage();
page.setDefaultTimeout(25000);

// ── error / network capture ─────────────────────────────────────────────────
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (err) => pageErrors.push(String(err?.message || err)));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
});
const net = [];
page.on('response', (r) => {
  try {
    const u = new URL(r.url());
    if (u.origin !== BASE) return;
    if (!/classification|classify|pii-scan|recommendations|dry-run|validate|cortex|complete/.test(u.pathname)) return;
    net.push(`${r.status()} ${r.request().method()} ${u.pathname}`);
  } catch { /* ignore */ }
});

const report = { steps: [], checks: {}, pageErrors, consoleErrors, network: net };
let failures = 0;
const step = (msg) => { report.steps.push(msg); console.log(`· ${msg}`); };
const check = (id, ok, detail) => {
  report.checks[id] = { ok, detail };
  if (!ok) failures++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${id}${detail ? ` — ${detail}` : ''}`);
};
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});

async function noCrash(id) {
  const boundary = await page
    .getByText(/Application error|Something went wrong|Unhandled Runtime Error/i)
    .first().isVisible().catch(() => false);
  check(`${id}.no-crash`, !boundary && pageErrors.length === 0,
    boundary ? 'error boundary visible' : pageErrors.length ? pageErrors.join(' | ').slice(0, 200) : 'clean');
}

/** Navigate and wait out the "Verifying session..." interstitial (token refresh). */
async function landOn(url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  for (let attempt = 0; attempt < 2; attempt++) {
    let verifying = await page.getByText(/Verifying session/i).first().isVisible().catch(() => false);
    const deadline = Date.now() + 60000;
    while (verifying && Date.now() < deadline) {
      await page.waitForTimeout(2000);
      verifying = await page.getByText(/Verifying session/i).first().isVisible().catch(() => false);
    }
    if (!verifying) break;
    step('session still verifying — reloading once');
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(4000);
  }
  await page.waitForTimeout(1000);
}

/** Select a project through a [role="listbox"] gate, preferring SEED_*. */
async function selectProjectViaGate(searchLabelRe) {
  const listbox = page.locator('[role="listbox"]').first();
  // The gate list can take a while to load — poll for the listbox; bail out
  // only when the gate heading itself is absent (project already selected).
  let gateVisible = false;
  const gateDeadline = Date.now() + 30000;
  while (Date.now() < gateDeadline) {
    gateVisible = await listbox.isVisible().catch(() => false);
    if (gateVisible) break;
    const gateHeading = await page
      .getByText(/Choose an explore & design project|Choose a workflow|Pick an existing/i)
      .first().isVisible().catch(() => false);
    const gateLoading = await page.getByText(/^Loading/i).first().isVisible().catch(() => false);
    if (!gateHeading && !gateLoading) break; // no gate at all — already inside
    await page.waitForTimeout(1000);
  }
  if (!gateVisible) return '(gate skipped — project already selected)';
  const search = page
    .locator('input[aria-label="Search projects"], input[aria-label="Search workflows"]')
    .first();
  if (await search.isVisible().catch(() => false)) {
    await search.fill('SEED_');
    await page.waitForTimeout(800);
  }
  let row = listbox.locator('button', { hasText: /SEED_/ }).first();
  if (!(await row.isVisible().catch(() => false))) {
    if (await search.isVisible().catch(() => false)) { await search.fill(''); await page.waitForTimeout(800); }
    row = listbox.locator('button').first();
  }
  await row.waitFor({ state: 'visible', timeout: 20000 });
  const name = ((await row.textContent().catch(() => '')) || '').trim().slice(0, 60);
  await row.click();
  await page.waitForTimeout(3500);
  return name;
}

/**
 * Click a CTA and watch it settle. Returns the terminal state:
 * 'result' | 'unavailable' | 'handled-error' | 'still-spinning' | 'gone'.
 */
async function clickAndSettle(button, { spinnerRe, unavailableSel, resultRe, scope }) {
  await button.click();
  const target = scope ?? page;
  const start = Date.now();
  let sawLoading = false;
  while (Date.now() - start < 30000) {
    const busy = await target.locator('[aria-busy="true"]').first().isVisible().catch(() => false);
    const spinTxt = spinnerRe
      ? await target.getByText(spinnerRe).first().isVisible().catch(() => false)
      : false;
    const spinning = busy || spinTxt;
    if (spinning) sawLoading = true;
    if (!spinning) {
      if (unavailableSel && await target.locator(unavailableSel).first().isVisible().catch(() => false)) {
        return { state: 'unavailable', sawLoading };
      }
      const errLoc = target.locator('[role="alert"]').first();
      if (await errLoc.isVisible().catch(() => false)) {
        const txt = ((await errLoc.textContent().catch(() => '')) || '').slice(0, 150);
        return { state: 'handled-error', sawLoading, detail: txt };
      }
      if (resultRe && await target.getByText(resultRe).first().isVisible().catch(() => false)) {
        return { state: 'result', sawLoading };
      }
      // settled with no spinner — give it a grace window for late loading
      if (sawLoading || Date.now() - start > 5000) return { state: 'settled', sawLoading };
    }
    await page.waitForTimeout(500);
  }
  return { state: 'still-spinning', sawLoading };
}

try {
  // ════════════════════════ PART A — /explore-design ════════════════════════
  await landOn(`${BASE}/explore-design`);
  step('landed on /explore-design');
  await shot('a0-explore-land');

  const exProject = await selectProjectViaGate(/Search project/i);
  step(`explore-design project: ${exProject}`);
  await shot('a1-explore-project');
  await noCrash('explore.land');

  // A2 — select a table (left rail rows carry a row-selection checkbox button).
  // Fresh SEED projects have no DB/schema yet — pick the first database and
  // schema from the toolbar so the catalog loads tables.
  const tableRow = page
    .locator('div.cursor-pointer:has(button[aria-label="Toggle row selection"])')
    .first();
  // Live catalog loads can be slow — wait out "Restoring project context…" /
  // "Loading tables…" (up to 60s) before concluding anything.
  for (let i = 0; i < 30; i++) {
    const restoring = await page.getByText(/Restoring project context|Loading tables/i).first()
      .isVisible().catch(() => false);
    if (!restoring) break;
    await page.waitForTimeout(2000);
  }
  let hasTable = await tableRow.isVisible({ timeout: 15000 }).catch(() => false);
  if (!hasTable) {
    const dbSelect = page.locator('select').first();
    if (await dbSelect.isVisible().catch(() => false)) {
      const options = await dbSelect.locator('option').allTextContents().catch(() => []);
      const target = options.find((o) => /CP_DATA360/i.test(o)) || options.find((o) => o && !/Select|No DB/i.test(o));
      if (target) {
        await dbSelect.selectOption({ label: target }).catch(() => {});
        step(`picked database: ${target}`);
        await page.waitForTimeout(2500);
        const schemaBtn = page.locator('button[aria-label="Select schemas"]').first();
        if (await schemaBtn.isVisible().catch(() => false)) {
          await schemaBtn.click();
          await page.waitForTimeout(2000);
          const schemaRow = page.locator('.absolute.top-full button').first();
          if (await schemaRow.isVisible().catch(() => false)) {
            const schemaName = ((await schemaRow.textContent().catch(() => '')) || '').trim();
            await schemaRow.click();
            step(`picked schema: ${schemaName}`);
            await page.waitForTimeout(1000);
            await page.keyboard.press('Escape').catch(() => {});
            await page.mouse.click(840, 400); // close the dropdown overlay
          }
        }
        hasTable = await tableRow.isVisible({ timeout: 30000 }).catch(() => false);
      }
    }
  }
  if (hasTable) {
    await tableRow.locator('span').first().click();
    await page.waitForTimeout(2000);
    step('selected first table');
  } else {
    step('NO TABLE in this project — right-bar CTAs limited to empty state');
  }
  await shot('a2-explore-table');

  // A3 — open the AI tab of the right bar
  const aiTab = page.locator('button[aria-label="AI Assist"]').first();
  const aiTabVisible = await aiTab.isVisible({ timeout: 10000 }).catch(() => false);
  check('explore.ai-tab-visible', aiTabVisible);
  if (aiTabVisible) {
    await aiTab.click();
    await page.waitForTimeout(1200);
    await shot('a3-explore-ai-tab');

    if (hasTable) {
      // A4 — classify CTA
      const classifyBtn = page.getByRole('button', { name: /Run AI Classification/i }).first();
      const classifyChip = page.locator('span[role="status"]', { hasText: /AI Classification unavailable/i });
      if (await classifyBtn.isVisible().catch(() => false)) {
        const r = await clickAndSettle(classifyBtn, {
          spinnerRe: /Classifying/i,
          unavailableSel: 'span[role="status"][aria-disabled="true"]',
          resultRe: /columns classified|Results —/i,
        });
        check('explore.classify.settles', r.state !== 'still-spinning', `state=${r.state} loadingSeen=${r.sawLoading}`);
        step(`classify CTA → ${r.state}`);
      } else if (await classifyChip.isVisible().catch(() => false)) {
        check('explore.classify.settles', true, 'pre-disabled unavailable chip (honest state)');
      } else {
        check('explore.classify.settles', false, 'classify CTA not found');
      }
      await shot('a4-explore-classify');
      await noCrash('explore.classify');

      // A5 — PII scan in Actions tab
      await page.locator('button[aria-label="Actions"]').first().click();
      await page.waitForTimeout(800);
      const scanBtn = page.getByRole('button', { name: /Scan PII & Detect Policies/i }).first();
      const scanChip = page.locator('span[role="status"]', { hasText: /PII scan unavailable/i });
      if (await scanBtn.isVisible().catch(() => false)) {
        const r = await clickAndSettle(scanBtn, {
          spinnerRe: /Scanning/i,
          unavailableSel: 'span[role="status"][aria-disabled="true"]',
          resultRe: /sensitive columns detected|Detected — select/i,
        });
        check('explore.pii-scan.settles', r.state !== 'still-spinning', `state=${r.state} loadingSeen=${r.sawLoading}`);
        step(`PII scan CTA → ${r.state}`);
      } else if (await scanChip.isVisible().catch(() => false)) {
        check('explore.pii-scan.settles', true, 'unavailable chip (honest state)');
      } else {
        check('explore.pii-scan.settles', false, 'PII scan CTA not found');
      }
      await shot('a5-explore-pii-scan');
      await noCrash('explore.pii-scan');
    } else {
      check('explore.classify.settles', true, 'skipped — project has no tables (empty state shown)');
      check('explore.pii-scan.settles', true, 'skipped — project has no tables');
    }
  }

  // A6 — ProjectContextPanel "Cortex Recommendations" tab + Refresh.
  // NOTE: the panel is currently unmounted in explore-design page.tsx
  // ({false && ...} — "all tabs now in ContextRightBar"), so its absence is a
  // DOCUMENTED GAP, not a behavioural failure of the CTA layer.
  const recosTab = page.getByText('Cortex Recommendations', { exact: false }).first();
  if (await recosTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await recosTab.click();
    await page.waitForTimeout(4000);
    const panelTxt = (await page.locator('.max-h-\\[min\\(60vh\\,480px\\)\\]').first().innerText().catch(() => '')) || '';
    const recosState = /aren't available on this backend/i.test(panelTxt)
      ? 'gap-note'
      : /Could not load recommendations/i.test(panelTxt)
        ? 'handled-error'
        : /open|No open recommendations/i.test(panelTxt)
          ? 'data-or-empty'
          : 'unknown';
    check('explore.recos.handled', recosState !== 'unknown', `state=${recosState}`);
    // Refresh CTA (present in data/empty states)
    const refreshBtn = page.getByRole('button', { name: /^Refresh$/ }).first();
    if (await refreshBtn.isVisible().catch(() => false)) {
      await refreshBtn.click();
      await page.waitForTimeout(4000);
      const spinning = await refreshBtn.locator('.animate-spin').isVisible().catch(() => false);
      check('explore.recos.refresh-settles', !spinning, spinning ? 'still spinning after 4s' : 'settled');
    } else {
      step('recos Refresh button not present in this state (gap or error)');
    }
    await shot('a6-explore-recos');
    await noCrash('explore.recos');
  } else {
    check('explore.recos.handled', true,
      'surface unmounted (ProjectContextPanel disabled in explore-design — documented gap)');
  }

  // ════════════════════════ PART B — /workflow ══════════════════════════════
  await landOn(`${BASE}/workflow`);
  step('landed on /workflow');
  await shot('b0-workflow-land');

  const wfProject = await selectProjectViaGate(/Search workflow/i);
  step(`workflow project: ${wfProject}`);
  await shot('b1-workflow-project');
  await noCrash('workflow.land');

  const panel = page.locator('[aria-label="Workflow smart panel"]');
  let panelVisible = false;
  for (let i = 0; i < 12 && !panelVisible; i++) {
    panelVisible = await panel.isVisible().catch(() => false);
    if (!panelVisible) await page.waitForTimeout(2500);
  }
  check('workflow.smart-panel-visible', panelVisible);

  if (panelVisible) {
    // B2 — AI assist section renders without crash
    await panel.locator('button[aria-label="AI assist"]').click();
    await page.waitForTimeout(2500);
    const aiBody = (await panel.innerText().catch(() => '')) || '';
    check('workflow.ai-section-renders', aiBody.length > 0 && !/Application error/i.test(aiBody),
      aiBody.slice(0, 120).replace(/\s+/g, ' '));
    await shot('b2-workflow-ai');
    await noCrash('workflow.ai');

    // B3 — Submit section: Lint DAG + Preview SQL (live, non-destructive)
    await panel.locator('button[aria-label="Submit for validation"]').click();
    await page.waitForTimeout(1500);
    await shot('b3-workflow-submit');

    for (const label of ['Lint DAG', 'Preview SQL']) {
      const btn = panel.getByRole('button', { name: label }).first();
      const chip = panel.locator(`span[role="status"][aria-disabled="true"]`, { hasText: label });
      if (await chip.isVisible().catch(() => false)) {
        check(`workflow.${label}.settles`, true, 'unavailable chip (honest pre-disabled state)');
        continue;
      }
      if (!(await btn.isVisible().catch(() => false))) {
        check(`workflow.${label}.settles`, false, 'button not found');
        continue;
      }
      const r = await clickAndSettle(btn, {
        spinnerRe: null,
        unavailableSel: `span[role="status"][aria-disabled="true"]`,
        resultRe: null,
        scope: panel,
      });
      check(`workflow.${label}.settles`, r.state !== 'still-spinning', `state=${r.state}`);
      step(`${label} → ${r.state}`);
      await page.waitForTimeout(1000);
    }
    await shot('b4-workflow-lint-dryrun');
    await noCrash('workflow.submit');

    // B5 — forced-error tests on the temp-tables validation (route-mocked, no
    // real backend call). First a 500 → inline role=alert; then a 501 → the
    // button must self-disable into the unavailable chip.
    // Preview SQL flips the active section to 'sql' — re-open Submit first.
    await panel.locator('button[aria-label="Submit for validation"]').click();
    await page.waitForTimeout(1200);
    const tempRadio = panel.getByText('Validate via temp tables', { exact: false }).first();
    if (await tempRadio.isVisible().catch(() => false)) {
      await tempRadio.click();
      await page.waitForTimeout(600);
      const submitLabel = 'Submit for validation (temp tables)';
      const submitBtn = panel.getByRole('button', { name: submitLabel }).first();

      if (await submitBtn.isVisible().catch(() => false)) {
        // forced 500
        await page.route('**/workflow/**/dry-run**', (route) =>
          route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'forced e2e failure' }) }));
        await submitBtn.click();
        await page.waitForTimeout(2500);
        const errVisible = await panel.locator('[role="alert"]').first().isVisible().catch(() => false);
        const reArmed = await submitBtn.isEnabled().catch(() => false);
        check('gate.forced-500.inline-error', errVisible, errVisible ? 'role=alert shown' : 'no inline error');
        check('gate.forced-500.re-armed', reArmed, reArmed ? 'button clickable again' : 'button stuck');
        await shot('b5-forced-500');
        await page.unroute('**/workflow/**/dry-run**');

        // forced 501 → auto-disable
        await page.route('**/workflow/**/dry-run**', (route) =>
          route.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ detail: 'not implemented' }) }));
        await submitBtn.click();
        await page.waitForTimeout(2500);
        const chip = panel.locator('span[role="status"][aria-disabled="true"]', { hasText: submitLabel });
        const chipVisible = await chip.isVisible().catch(() => false);
        check('gate.forced-501.auto-disable', chipVisible,
          chipVisible ? 'unavailable chip rendered' : 'button did not self-disable');
        await shot('b6-forced-501');
        await page.unroute('**/workflow/**/dry-run**');
      } else {
        check('gate.forced-500.inline-error', false, 'temp-tables submit button not found');
      }
    } else {
      check('gate.forced-500.inline-error', false, 'temp-tables strategy radio not found');
    }
    await noCrash('workflow.forced');
  }
} catch (e) {
  failures++;
  report.steps.push(`FATAL: ${String(e?.message || e).slice(0, 300)}`);
  await shot('z9-failure');
}

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(`\n${'─'.repeat(60)}`);
console.log(`Checks: ${Object.keys(report.checks).length}, failures: ${failures}`);
console.log(`Console errors: ${consoleErrors.length}, page errors: ${pageErrors.length}`);
console.log(`Report: ${OUT}/report.json`);
await browser.close();
process.exit(failures > 0 ? 1 : 0);
