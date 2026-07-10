import { test, expect, type Page, type Locator } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * AXIS VALIDATION — right-bar / cockpit rails, in the real browser.
 *
 * For every module page that ships a right rail (AxisCockpit, RightTabPanel,
 * BiSmartRightBar, WorkflowSmartPanel), click EVERY axis tab and verify:
 *   (a) the panel opens (aria-pressed flips / panel section appears)
 *   (b) it reaches a NON-skeleton state within 60s (strict: a spinner with no
 *       real content after 60s = STUCK_SKELETON)
 *   (c) it contains real content (innerText > 80 chars = RICH, or an explicit
 *       empty-state message = HONEST_EMPTY)
 *   (d) zero uncaught page errors on the page (the ONLY hard assertion)
 *
 * Per-axis checks are SOFT asserts so the suite reports the full matrix and
 * still passes in CI as long as nothing throws in the page. Verdicts:
 *   RICH / HONEST_EMPTY / STUCK_SKELETON / ERROR / MISSING_TAB
 *
 * /explore-design is intentionally NOT covered here (owned by another suite).
 *
 * Run:
 *   D360_PASS=... npx playwright test e2e/axis-validation.spec.ts --reporter=line
 * Optional: AXIS_VALIDATION_JSON=/abs/path.json for an extra results copy.
 *
 * Artifacts (screenshots, results JSON, auth state) live in
 * e2e/axis-validation-artifacts/ — deliberately OUTSIDE the configured
 * outputDir (./e2e/results), which Playwright WIPES at the start of every
 * invocation. Anything this suite must keep across runs cannot live there.
 */

const PASS = process.env.D360_PASS ?? '';
const SHOTS_DIR = path.join(__dirname, 'axis-validation-artifacts');
const STATE_FILE = path.join(SHOTS_DIR, '.auth-state.json');
const RESULTS_FILE = path.join(SHOTS_DIR, 'axis_validation.json');
const EXTRA_RESULTS_FILE = process.env.AXIS_VALIDATION_JSON ?? '';

const SKELETON_BUDGET_MS = 60_000;
const RICH_MIN_CHARS = 80;

// Speed over cinematography: this is a validation suite, not a demo video.
test.use({ video: 'off', launchOptions: { slowMo: 0 }, storageState: STATE_FILE });
test.setTimeout(10 * 60_000);

/* ── Results accumulator (merged to disk after every page) ── */

type AxisVerdict = 'RICH' | 'HONEST_EMPTY' | 'STUCK_SKELETON' | 'ERROR' | 'MISSING_TAB';

interface AxisResult {
  label: string;
  verdict: AxisVerdict;
  opened: boolean;
  skeleton_ms: number | null; // ms until non-skeleton; null = never (within budget)
  chars: number;
  sample: string;
  screenshot: string | null;
  note?: string;
}

interface PageResult {
  path: string;
  rail_kind: string;
  rail_found: boolean;
  axes: AxisResult[];
  page_errors: string[];
  console_errors: string[];
  notes: string[];
}

const results: Record<string, PageResult> = {};

function saveResults() {
  // Merge with what a previous (partial) run already wrote so the suite can be
  // executed page-by-page (--grep) and still produce one complete JSON.
  let previous: Record<string, PageResult> = {};
  for (const f of [EXTRA_RESULTS_FILE, RESULTS_FILE]) {
    if (!f) continue;
    try {
      Object.assign(previous, JSON.parse(fs.readFileSync(f, 'utf-8')).pages ?? {});
    } catch {
      /* no previous run */
    }
  }
  const payload = {
    generated_at: new Date().toISOString(),
    base_url: 'http://localhost:3000',
    skeleton_budget_ms: SKELETON_BUDGET_MS,
    rich_min_chars: RICH_MIN_CHARS,
    pages: { ...previous, ...results },
  };
  const json = JSON.stringify(payload, null, 2);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  fs.writeFileSync(RESULTS_FILE, json);
  if (EXTRA_RESULTS_FILE) {
    fs.mkdirSync(path.dirname(EXTRA_RESULTS_FILE), { recursive: true });
    fs.writeFileSync(EXTRA_RESULTS_FILE, json);
  }
}

/* ── Auth: sign in ONCE, reuse the storage state everywhere ── */

fs.mkdirSync(SHOTS_DIR, { recursive: true });
if (!fs.existsSync(STATE_FILE)) {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));
}

async function signIn(page: Page) {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  // Reuse a fresh session across sequential invocations / worker restarts —
  // re-signing in for every worker is the flakiest step of the whole suite.
  try {
    const stat = fs.statSync(STATE_FILE);
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    if ((state.cookies?.length ?? 0) > 0 && Date.now() - stat.mtimeMs < 20 * 60_000) return;
  } catch {
    /* no reusable state */
  }
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page);
  await ctx.storageState({ path: STATE_FILE });
  await ctx.close();
});

test.afterEach(() => saveResults());

/* ── Page plumbing ── */

function watchErrors(page: Page, rec: PageResult) {
  page.on('pageerror', (err) => rec.page_errors.push(String(err?.message ?? err).slice(0, 500)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') rec.console_errors.push(msg.text().slice(0, 300));
  });
}

async function openPage(page: Page, urlPath: string) {
  page.setDefaultNavigationTimeout(90_000);
  await page.goto(urlPath, { waitUntil: 'domcontentloaded' });
  // Session may have expired mid-suite — sign back in once and retry.
  if (page.url().includes('/signin')) {
    await signIn(page);
    await page.goto(urlPath, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
}

/* ── Axis assessment ── */

const ERROR_RX = /something went wrong|application error|unhandled|minified react error|chunkloaderror/i;
const EMPTY_RX = /\bno\b|\bnone\b|not (yet )?(configured|available|run)|nothing|empty|unavailable|no data|not found|aucun|select (a|an)\b|coming soon|0 (results|rows|items)|—/i;

async function skeletonState(panel: Locator): Promise<{ skel: boolean; text: string }> {
  const pulse = await panel.locator('.animate-pulse').count().catch(() => 0);
  const spin = await panel.locator('.animate-spin').count().catch(() => 0);
  const text = ((await panel.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
  // A spinner NEXT TO real content (e.g. a "running" run row) is not a skeleton;
  // a spinner with nothing else, or any pulse placeholder, is.
  const skel = text.length === 0 || pulse > 0 || (spin > 0 && text.length < RICH_MIN_CHARS);
  return { skel, text };
}

function classify(text: string): { verdict: AxisVerdict; note?: string } {
  if (ERROR_RX.test(text)) return { verdict: 'ERROR', note: 'error boundary / crash text in panel' };
  if (text.length > RICH_MIN_CHARS) return { verdict: 'RICH' };
  if (EMPTY_RX.test(text)) return { verdict: 'HONEST_EMPTY' };
  return { verdict: 'ERROR', note: `thin content (${text.length} chars) with no explicit empty-state message` };
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'axis';
}

/**
 * Click every button of a rail nav; for each, resolve the content panel and
 * grade it. `panelFor(label)` maps an axis label to its content Locator.
 */
async function auditRail(
  page: Page,
  rec: PageResult,
  pageId: string,
  nav: Locator,
  panelFor: (label: string) => Locator,
) {
  const railVisible = await nav.isVisible().catch(() => false);
  rec.rail_found = railVisible;
  if (!railVisible) {
    rec.notes.push('rail nav not found/visible');
    console.log(`AXIS ${pageId} :: RAIL NOT FOUND`);
    return;
  }

  const buttons = nav.locator('button');
  const count = await buttons.count();
  rec.notes.push(`rail has ${count} axis buttons`);

  for (let i = 0; i < count; i++) {
    const btn = buttons.nth(i);
    const label =
      (await btn.getAttribute('aria-label').catch(() => null)) ??
      (await btn.getAttribute('title').catch(() => null)) ??
      ((await btn.innerText().catch(() => '')) || `axis-${i}`).trim();

    const axis: AxisResult = {
      label,
      verdict: 'MISSING_TAB',
      opened: false,
      skeleton_ms: null,
      chars: 0,
      sample: '',
      screenshot: null,
    };
    rec.axes.push(axis);

    try {
      const pressed = await btn.getAttribute('aria-pressed').catch(() => null);
      if (pressed !== 'true') {
        await btn.click({ timeout: 10_000 });
      }
      // (a) the panel opens — aria-pressed flips on every rail implementation.
      await expect(btn).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 }).catch(() => {});
      const nowPressed = (await btn.getAttribute('aria-pressed').catch(() => null)) === 'true';

      const panel = panelFor(label);
      const panelVisible = await panel
        .waitFor({ state: 'visible', timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      axis.opened = panelVisible && (nowPressed || panelVisible);

      if (!panelVisible) {
        axis.verdict = 'MISSING_TAB';
        axis.note = nowPressed
          ? 'button activates but no matching panel became visible'
          : 'axis button did not activate a panel';
      } else {
        // (b) non-skeleton within 60s — strict.
        const started = Date.now();
        let state = await skeletonState(panel);
        while (state.skel && Date.now() - started < SKELETON_BUDGET_MS) {
          await page.waitForTimeout(2_000);
          state = await skeletonState(panel);
        }
        axis.skeleton_ms = state.skel ? null : Date.now() - started;
        axis.chars = state.text.length;
        axis.sample = state.text.slice(0, 220);

        if (state.skel) {
          axis.verdict = 'STUCK_SKELETON';
          axis.note = 'still skeleton/spinner-only after 60s';
        } else {
          // (c) real content or an honest empty state.
          const graded = classify(state.text);
          axis.verdict = graded.verdict;
          if (graded.note) axis.note = graded.note;
        }
      }

      // Screenshot the panel (fall back to the viewport).
      const shot = path.join(SHOTS_DIR, `${pageId}--${slug(label)}.png`);
      try {
        if (axis.opened) await panel.screenshot({ path: shot, timeout: 10_000 });
        else await page.screenshot({ path: shot });
        axis.screenshot = shot;
      } catch {
        try {
          await page.screenshot({ path: shot });
          axis.screenshot = shot;
        } catch {
          /* screenshot is best-effort */
        }
      }
    } catch (e) {
      axis.verdict = 'ERROR';
      axis.note = `interaction failed: ${String((e as Error)?.message ?? e).slice(0, 200)}`;
    }

    // Per-axis outcomes are RECORDED, not asserted — the suite must stay green
    // in CI unless the page actually throws. Non-healthy verdicts land in the
    // JSON + this log line for the humans (and agents) reading the report.
    console.log(
      `AXIS ${pageId} :: ${label} -> ${axis.verdict}` +
        ` (opened=${axis.opened}, chars=${axis.chars}, settle=${axis.skeleton_ms ?? '>60000'}ms)` +
        (axis.note ? ` — ${axis.note}` : ''),
    );
  }
}

/* ── Rail resolvers per implementation ── */

// AxisCockpit (shared/cockpit/AxisCockpit.tsx): nav[aria-label="Module axes"],
// buttons carry title={label}; the open panel is section[aria-label="{label} panel"].
async function auditAxisCockpit(page: Page, rec: PageResult, pageId: string) {
  const nav = page.locator('nav[aria-label="Module axes"]').first();
  const navCount = await page.locator('nav[aria-label="Module axes"]').count();
  if (navCount > 1) rec.notes.push(`${navCount} "Module axes" rails on page; auditing the first`);
  await auditRail(page, rec, pageId, nav, (label) =>
    page.locator(`section[aria-label="${label} panel"]`).first(),
  );
}

// RightTabPanel (shared/governance/right-tab-panel.tsx): nav[aria-label="Panel sections"]
// inside a role=region docked panel; sections switch in place.
async function auditRightTabPanel(page: Page, rec: PageResult, pageId: string) {
  const nav = page.locator('nav[aria-label="Panel sections"]').first();
  const region = page
    .locator('[role="region"]')
    .filter({ has: page.locator('nav[aria-label="Panel sections"]') })
    .first();
  await auditRail(page, rec, pageId, nav, () => region);
}

function newPageResult(urlPath: string, railKind: string): PageResult {
  return {
    path: urlPath,
    rail_kind: railKind,
    rail_found: false,
    axes: [],
    page_errors: [],
    console_errors: [],
    notes: [],
  };
}

function assertNoPageErrors(rec: PageResult, pageId: string) {
  // THE hard gate: an uncaught exception in the page fails the suite.
  expect(rec.page_errors, `[${pageId}] uncaught page errors`).toEqual([]);
}

/* ═══════════════════════ THE PAGES ═══════════════════════ */

test('axes: /governance (AxisCockpit)', async ({ page }) => {
  const rec = (results['governance'] = newPageResult('/governance', 'AxisCockpit'));
  watchErrors(page, rec);
  await openPage(page, '/governance');
  await auditAxisCockpit(page, rec, 'governance');
  assertNoPageErrors(rec, 'governance');
});

test('axes: /account-overview (Command Center AxisCockpit)', async ({ page }) => {
  const rec = (results['account-overview'] = newPageResult('/account-overview', 'AxisCockpit'));
  watchErrors(page, rec);
  await openPage(page, '/account-overview');
  await auditAxisCockpit(page, rec, 'account-overview');
  assertNoPageErrors(rec, 'account-overview');
});

test('axes: /data-quality (AxisCockpit: DQ/Fresh/Integrity/Rules/Cost/History/AI)', async ({ page }) => {
  const rec = (results['data-quality'] = newPageResult('/data-quality', 'AxisCockpit'));
  watchErrors(page, rec);
  await openPage(page, '/data-quality');
  await auditAxisCockpit(page, rec, 'data-quality');
  assertNoPageErrors(rec, 'data-quality');
});

test('axes: /bi-dashboard landing + editor (BiSmartRightBar)', async ({ page }) => {
  const landing = (results['bi-dashboard-landing'] = newPageResult('/bi-dashboard', 'AxisCockpit (BiLandingCockpit)'));
  watchErrors(page, landing);
  await openPage(page, '/bi-dashboard');
  await auditAxisCockpit(page, landing, 'bi-dashboard-landing');

  // Enter the first real dashboard to reach the editor's BiSmartRightBar.
  const editor = (results['bi-dashboard-editor'] = newPageResult('/bi-dashboard/[projectId]', 'BiSmartRightBar'));
  const link = page.locator('a[href^="/bi-dashboard/"]').first();
  if (await link.isVisible().catch(() => false)) {
    const href = await link.getAttribute('href');
    editor.path = href ?? editor.path;
    await link.click();
    await page.waitForURL(/\/bi-dashboard\/.+/, { timeout: 60_000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});

    // The bar can boot collapsed — expand it first.
    const collapsed = page.locator('nav[aria-label="BI panel sections (collapsed)"]');
    if (await collapsed.isVisible().catch(() => false)) {
      await page.locator('button[aria-label="Expand panel"]').first().click().catch(() => {});
    }
    const region = page.locator('[role="region"][aria-label="BI dashboard smart panel"]').first();
    await region.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {});
    const nav = page.locator('nav[aria-label="BI panel sections"]').first();
    await auditRail(page, editor, 'bi-dashboard-editor', nav, () => region);
  } else {
    editor.notes.push('no dashboard card link found on the landing page — editor rail not reachable');
    console.log('AXIS bi-dashboard-editor :: RAIL NOT REACHED (no dashboard card to open)');
  }
  assertNoPageErrors(landing, 'bi-dashboard');
});

test('axes: /project (ProjectsCockpit: Overview/Deploy/History)', async ({ page }) => {
  const rec = (results['project'] = newPageResult('/project', 'AxisCockpit (ProjectsCockpit)'));
  watchErrors(page, rec);
  await openPage(page, '/project');
  await page
    .locator('aside[aria-label="Projects cockpit"]')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => rec.notes.push('aside[aria-label="Projects cockpit"] not visible'));
  await auditAxisCockpit(page, rec, 'project');
  assertNoPageErrors(rec, 'project');
});

test('axes: /workflow?project=proj_88f77162c19e (WorkflowSmartPanel)', async ({ page }) => {
  const rec = (results['workflow'] = newPageResult('/workflow?project=proj_88f77162c19e', 'WorkflowSmartPanel'));
  watchErrors(page, rec);
  await openPage(page, '/workflow?project=proj_88f77162c19e');
  const region = page.locator('[role="region"][aria-label="Workflow smart panel"]').first();
  await region.waitFor({ state: 'visible', timeout: 90_000 }).catch(() => rec.notes.push('Workflow smart panel region never became visible'));
  const nav = page.locator('nav[aria-label="Workflow panel sections"]').first();
  await auditRail(page, rec, 'workflow', nav, () => region);
  assertNoPageErrors(rec, 'workflow');
});

test('axes: /sources (ObjectSmartPanel — select a table, then its sections)', async ({ page }) => {
  const rec = (results['sources'] = newPageResult('/sources', 'RightTabPanel (ObjectSmartPanel)'));
  watchErrors(page, rec);
  await openPage(page, '/sources');

  // The panel only grows its section rail once a TABLE is selected. Walk the
  // source tree: expand db -> expand schema -> click the first table row.
  const nav = page.locator('nav[aria-label="Panel sections"]').first();
  for (let attempt = 0; attempt < 8; attempt++) {
    if (await nav.isVisible().catch(() => false)) break;
    // Table rows are the indented leaf buttons (class ml-4, no aria-expanded).
    const tableBtn = page.locator('button.ml-4:not([aria-expanded])').first();
    if (await tableBtn.isVisible().catch(() => false)) {
      await tableBtn.click().catch(() => {});
    } else {
      const expander = page.locator('button[aria-expanded="false"]').first();
      if (!(await expander.isVisible().catch(() => false))) break;
      await expander.click().catch(() => {});
    }
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(1_000);
  }

  if (await nav.isVisible().catch(() => false)) {
    await auditRightTabPanel(page, rec, 'sources');
  } else {
    rec.notes.push('could not reach a selected-table state; ObjectSmartPanel section rail never appeared');
    console.log('AXIS sources :: RAIL NOT REACHED (no table selected)');
  }
  assertNoPageErrors(rec, 'sources');
});
