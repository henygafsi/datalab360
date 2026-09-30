/**
 * studio-flow — the Application Studio surface, end to end (local build
 * :3000 + local backend :8078, same contract as ao-local-integration).
 *
 * Covers the five /studio pages against REAL backend answers:
 *  1. /studio         — industry → category → focus selector (multi-focus),
 *                       context brief, journey seed (context chip on Sources)
 *  2. /studio/source  — connector grid (honest statuses), multi-select
 *                       databases + tables, metadata-only KPIs, row scope
 *  3. /studio/settings — applications list, config, analysis, AI registry
 *  4. /studio/gov     — icon tiles (caller-scoped reads) + chat-only access
 *  5. /studio/workspace + /studio/model — tabs, rails, graph, refine chat,
 *                       sources scorecards, knowledge (app + account-wide)
 *
 * The AI analyze leg (understand use_ai) spends the free-preview envelope —
 * it only runs when D360_STUDIO_AI=1. Brand rule asserted on every page:
 * no vendor names in the rendered copy.
 *
 * Requires: D360_PASS in the env; next start :3000 with
 * API_PROXY_UPSTREAM=127.0.0.1:8078; uvicorn :8078.
 */
import { test, expect, type Page } from '@playwright/test';

const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';
const RUN_AI = process.env.D360_STUDIO_AI === '1';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

let page: Page;

async function login(p: Page): Promise<void> {
  await p.goto('/signin', { waitUntil: 'domcontentloaded' });
  await p.locator('input[name="account_name"], input#account_name').first().fill(ACCOUNT);
  await p.locator('input[name="username"], input#username').first().fill(USER);
  await p.locator('input[type="password"]').first().fill(PASS);
  await p.locator('button[type="submit"]').first().click();
  await expect
    .poll(
      async () => {
        const s = await p
          .request.get('/api/auth/session')
          .then((r) => r.json())
          .catch(() => null);
        return Boolean(s?.user?.access_token);
      },
      { timeout: 90_000 },
    )
    .toBe(true);
}

async function noVendorLeak(p: Page): Promise<void> {
  const text = await p.evaluate(() => document.body.innerText);
  for (const vendor of ['Snowflake', 'Cortex', 'Kimi']) {
    expect(text, `brand rule: "${vendor}" must not reach customer copy`).not.toContain(vendor);
  }
}

/** The app redirects to its landing page right after login — a first goto
 *  can be interrupted by that navigation. Retry once after it settles. */
async function gotoStable(p: Page, url: string): Promise<void> {
  try {
    await p.goto(url, { waitUntil: 'domcontentloaded' });
  } catch {
    await p.waitForLoadState('domcontentloaded').catch(() => undefined);
    await p.goto(url, { waitUntil: 'domcontentloaded' });
  }
}

test.beforeAll(async ({ browser }) => {
  test.skip(!PASS, 'D360_PASS not set — live journey needs real credentials');
  page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  await login(page);
});

test('home: the applications first, inside the light Studio shell', async () => {
  await gotoStable(page, '/studio');
  await expect(page.getByText('Your applications')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'New application', exact: true })).toBeVisible();
  // the LIGHT shell — no platform sidebar stack inside the Studio
  await expect(page.getByText('Full platform')).toBeVisible();
  await expect(page.getByText('Account Overview')).toHaveCount(0);
  await noVendorLeak(page);
});

test('entry: industry → category → focus selector seeds the journey with context', async () => {
  await gotoStable(page, '/studio/new');
  await expect(page.getByText('What do you want to understand or automate?')).toBeVisible({
    timeout: 30_000,
  });

  // industries (backend taxonomy ∪ curated), sub-page links
  await expect(page.getByRole('option', { name: /Retail & distribution/ })).toBeVisible();
  await expect(page.getByText('Governance & access')).toBeVisible();

  await page.getByRole('option', { name: /Retail & distribution/ }).click();
  await page.getByRole('button', { name: /Sales & inventory/ }).click();

  // multi-focus: two questions combine into one need
  await page.getByRole('button', { name: /Store profitability/ }).click();
  await page.getByRole('button', { name: /Stock cover risk/ }).click();
  await expect(page.getByText('The AI drafts everything from this')).toBeVisible();
  await expect(page.getByText(/Store profitability \+ Stock cover risk/).first()).toBeVisible();

  // drill order prefilled from the served taxonomy
  await expect(page.getByText('company', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Start — the AI drafts the application/ }).click();
  // lands on Sources with the context chip visible (compression rule)
  await expect(page.getByText(/Context: retail/)).toBeVisible({ timeout: 15_000 });
  await noVendorLeak(page);
});

test('source onboarding: honest connector grid, multi-select, metadata-only KPIs', async () => {
  await page.goto('/studio/source', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Where does your data live?')).toBeVisible({ timeout: 30_000 });
  // one-viewport step: warehouse card reports live readiness, family chips filter
  await expect(page.getByText(/\d+ databases · ready/)).toBeVisible({ timeout: 90_000 });

  // real catalog with honest statuses — nothing simulated
  await expect(page.getByText('not integrated yet').first()).toBeVisible();
  // no page scroll: the grid scrolls internally, the step fits one viewport
  const noPageScroll = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight < 120,
  );
  expect(noPageScroll).toBe(true);
  await page.getByRole('button', { name: /Your data warehouse/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'CP_DATA360' }).click();
  await page.locator('input[aria-label="Filter tables"]').fill('RETAIL_DW.DIM_ITEMS');
  await page
    .locator('label:has-text("RETAIL_DW.DIM_ITEMS") input')
    .first()
    .check({ timeout: 30_000 });
  await expect(page.getByText('1 table(s) selected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // metadata only — the honest line is part of the contract
  await expect(
    page.getByText('no row of your data has been read', { exact: false }).first(),
  ).toBeVisible();
  await expect(page.getByText('Rows to analyze').first()).toBeVisible();
  await noVendorLeak(page);

  if (RUN_AI) {
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: /Analyze 1 table/ }).click();
    await expect(page.getByText('Create an application from this data')).toBeVisible({
      timeout: 180_000,
    });
    await expect(page.getByText(/History:/).first()).toBeVisible();
  }
});

test('admin: applications, config, analysis and the AI registry panels', async () => {
  await page.goto('/studio/admin', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Your applications')).toBeVisible({ timeout: 30_000 });
  // at least one application exists after the journeys above
  await expect(page.getByText('Configuration').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Analysis').first()).toBeVisible();
  await expect(page.getByText('Suggestions to confirm')).toBeVisible();
  await expect(page.getByText('AI history')).toBeVisible();
  await noVendorLeak(page);
});

test('gov: caller-scoped tiles and the chat-only access plan', async () => {
  await page.goto('/studio/gov', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Governance & access').first()).toBeVisible({ timeout: 30_000 });
  for (const tile of ['Application roles', 'My access', 'Policies', 'My requests']) {
    await expect(page.getByRole('tab', { name: new RegExp(tile) })).toBeVisible();
  }
  await expect(page.getByText('Signed in as', { exact: false })).toBeVisible({ timeout: 30_000 });

  // chat-only creation — no form anywhere
  const chat = page.locator('input[aria-label="Your answer"]');
  await chat.fill('role BI_ANALYST');
  await chat.press('Enter');
  await chat.fill('view');
  await chat.press('Enter');
  const appChip = page
    .locator('section[aria-label="Set up access by chat"] button.rounded-full')
    .first();
  await appChip.click({ timeout: 15_000 });
  await expect(
    page.getByText(/proposed plan|could not be prepared/, { exact: false }),
  ).toBeVisible({ timeout: 60_000 });
  await noVendorLeak(page);
});

test('workspace + model: tabs, prefilled rails, graph, refine chat', async () => {
  // The REAL path: home → the application card → /studio/apps/[id]
  await page.goto('/studio', { waitUntil: 'domcontentloaded' });
  // the home paginates at 12 — expand before looking for the fixture card
  const showAll = page.getByRole('button', { name: /Show all \d+ applications/ });
  if (await showAll.count()) await showAll.click();
  await page
    .getByRole('link', { name: /endpoint-test retail/ })
    .first()
    .click({ timeout: 45_000 });
  await expect(page).toHaveURL(/\/studio\/apps\//, { timeout: 30_000 });
  await expect(page.getByRole('tab', { name: 'Reporting' })).toBeVisible({ timeout: 45_000 });
  for (const tab of ['Sources', 'Model', 'Jobs', 'Quality', 'Access']) {
    await expect(page.getByRole('tab', { name: tab, exact: true })).toBeVisible();
  }
  await expect(page.getByText('Data', { exact: true })).toBeVisible({ timeout: 60_000 });
  // the atelier vocabulary sits on the reporting rail
  await expect(page.getByText('Widgets').first()).toBeVisible();

  // self-service reporting: REAL charts render (the legacy BI renderer —
  // axes, grid, tooltips), every tile has a viz switcher + resize, and a
  // widget can be added
  await expect(
    page.locator('.recharts-surface, svg[role="img"]').first(),
  ).toBeVisible({ timeout: 60_000 });
  // chart TYPE lives in the right bar as an ICON PICKER (never on the tile,
  // never a long list); remove + export on every tile
  // the rail shows only the CURRENT visual; the palette opens on demand and
  // its shapes are enabled/greyed by the contract, never hardcoded
  const typeBtn = page.locator('button[aria-label^="Chart type for"]').first();
  await expect(typeBtn).toBeVisible({ timeout: 30_000 });
  await expect(
    page.locator('[role="radiogroup"][aria-label^="Chart type"]'),
  ).toHaveCount(0);
  await typeBtn.click();
  await expect(
    page.locator('[role="radiogroup"][aria-label^="Chart type"] [role="radio"]').first(),
  ).toBeVisible({ timeout: 30_000 });
  expect(
    await page.locator('[role="radiogroup"][aria-label^="Chart type"] [role="radio"]').count(),
  ).toBeGreaterThan(10);
  await typeBtn.click();
  await expect(page.locator('button[title^="Remove this"]').first()).toBeVisible();
  // the bare CSV button was replaced by the scoped export menu: one
  // unlabelled "Download" shipped a preview-capped extract as if it were
  // the answer (see e2e/studio-filters-export.spec.ts for the full cover)
  await expect(page.getByRole('button', { name: 'Export this widget' }).first()).toBeVisible();
  await expect(page.getByText('Add a widget')).toBeVisible();

  // Jobs = a PILOT TABLE (state/result/schedule readable without logs);
  // loads and automations are two filters over one surface, not stacked
  await page.getByRole('tab', { name: 'Jobs', exact: true }).click();
  await expect(page.getByRole('tab', { name: /Loads/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('columnheader', { name: /process/i })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole('columnheader', { name: /schedule/i })).toBeVisible();
  // no unfolded logs on the list — proofs live in the editor's Runs section
  await expect(page.getByText(/query_id per step/)).toHaveCount(0);
  // the editor opens wide with its four sections and honest save/test split
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Run test (sandbox)' })).toBeVisible();
  for (const s of ['Transformation', 'Quality & rejects', 'Trigger', 'Runs']) {
    await expect(page.getByRole('tab', { name: new RegExp(s) })).toBeVisible();
  }
  await page.getByRole('button', { name: 'All processes' }).click();
  // the C-2 workflows keep ONE definition — reachable behind the filter
  await page.getByRole('tab', { name: 'Automations', exact: true }).click();
  await expect(page.getByText('Workflows', { exact: true })).toBeVisible({ timeout: 120_000 });
  await page.getByRole('tab', { name: 'Quality', exact: true }).click();
  await expect(page.getByText('Data quality gate')).toBeVisible();
  // run the REAL DQ gate — verdicts, not decoration
  await page.getByRole('button', { name: 'Run the checks' }).click();
  await expect(page.getByText(/Overall:/).first()).toBeVisible({ timeout: 120_000 });

  // Sources — honest per-table signals; a real value or '—', never an invented 0
  await page.getByRole('tab', { name: 'Sources' }).click();
  await expect(page.getByText('Sources').first()).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText('Every table this application reads', { exact: false }).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/last load|risk|—/).first()).toBeVisible({ timeout: 60_000 });
  // one score pill per row — numeric once freshness/lineage land, '—' until then
  await expect(
    page
      .locator('section:has-text("Every table this application reads") span.rounded-full')
      .first(),
  ).toBeVisible({ timeout: 60_000 });

  // Data & jobs truth contract — per-source state chips + the honest
  // no-job line (nothing invented to look complete)
  await expect(page.getByText('Jobs & pipelines')).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByText(/^(verified|loaded|running|configured)$/).first(),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByText(/No job exists for this application|Ingestion is needed/).first(),
  ).toBeVisible();
  await expect(page.getByText(/Perimeter: preview/).first()).toBeVisible();

  // Knowledge — this app's enrichments + the account-wide memory, learning stays manual
  await page.getByRole('tab', { name: 'Knowledge' }).click();
  await expect(page.getByText('Account knowledge').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('nothing is learned without you').first()).toBeVisible({
    timeout: 30_000,
  });

  await page.goto('/studio/model', { waitUntil: 'domcontentloaded' });
  // the newest draft may or may not carry a model yet — both outcomes are
  // valid, and both must be said honestly
  await expect(
    page.getByText(/Change it with a sentence|No model yet|could not be read/).first(),
  ).toBeVisible({ timeout: 90_000 });
  await noVendorLeak(page);
});
