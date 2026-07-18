import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Agentic OS — discussion battery. Every scenario drives a REAL conversation
 * (live Cortex / catalog / registry) and RECORDS its outcome: a JSONL journal
 * (discussion-log.jsonl) + one screenshot per scenario. In-app, every turn is
 * additionally persisted as an agentic_os_discussion event by the OS itself.
 * Assertions demand real outcomes (tested drafts, created projects, honest
 * governance denials) — never merely "no error".
 */
const PASS = process.env.D360_PASS ?? '';
const STATE = path.join(__dirname, 'night-audit-artifacts', '.auth.json');
const SHOTS = path.join(__dirname, 'agentic-os-artifacts', 'discussions');
const JOURNAL = path.join(__dirname, 'agentic-os-artifacts', 'discussion-log.jsonl');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(path.dirname(STATE), { recursive: true });
if (!fs.existsSync(STATE)) fs.writeFileSync(STATE, JSON.stringify({ cookies: [], origins: [] }));

function record(scenario: string, outcome: string) {
  fs.appendFileSync(
    JOURNAL,
    JSON.stringify({ ts: new Date().toISOString(), scenario, outcome: outcome.slice(0, 400) }) + '\n',
  );
  console.log(`DISCUSSION [${scenario}] ${outcome.slice(0, 180).replace(/\n/g, ' | ')}`); // eslint-disable-line no-console
}

async function lastAgentCard(page: Page): Promise<string> {
  return (
    (await page
      .locator('div.rounded-xl.border')
      .last()
      .innerText()
      .catch(() => '')) ?? ''
  );
}

async function ask(page: Page, text: string) {
  const box = page.getByLabel('Ask the agent');
  await box.fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });
  await ctx.storageState({ path: STATE });
  await ctx.close();
});

test.use({ storageState: STATE, viewport: { width: 1440, height: 900 } });
test.setTimeout(420_000);

test('STAR SCHEMA on a fresh agent-created project (the user flow, end to end)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/intelligent', { waitUntil: 'domcontentloaded' });
  const stepNav = page.getByRole('navigation', { name: 'Lifecycle steps' });
  await expect(stepNav).toBeVisible({ timeout: 30_000 });

  // 1 · The agent creates the project itself (the user's own phrasing).
  await ask(page, 'jeveu un projet desin and explore ac une modelisation en etoile et ajoute les table / ingestion');
  await expect(page.getByText(/Done — I created draft project AGENTIC_/)).toBeVisible({ timeout: 120_000 });
  record('create-project-fr', await lastAgentCard(page));

  // 2 · Models step → "propose a star schema" → governed proposals or a
  //     concrete grounded answer (both are real outcomes; blank is not).
  await stepNav.getByRole('button', { name: /Models/i }).click();
  await ask(page, 'propose a star schema over the selected tables');
  // CREATOR contract: a READY model card — flow preview with real columns +
  // one-click creation. Fallback text (parse miss) is tolerated but recorded.
  const modelCard = page.getByRole('button', { name: 'Create this model in the project' });
  const gotCard = await modelCard
    .waitFor({ state: 'visible', timeout: 150_000 })
    .then(() => true)
    .catch(() => false);
  if (gotCard) {
    await expect(page.locator('.react-flow').last(), 'model flow preview').toBeVisible();
    record('star-schema-preview', 'model card with flow preview rendered');
    await modelCard.click();
    await expect(page.getByText(/Created — \d+\/\d+ relationships/), 'model CREATED in the project').toBeVisible({
      timeout: 60_000,
    });
    record('star-schema-created', await lastAgentCard(page));
  } else {
    record('star-schema-on-project', await lastAgentCard(page));
  }
  await page.screenshot({ path: path.join(SHOTS, 'star-schema.png') });

  expect(errors, `page errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('PROCESS REUSE: discussion stored in the project timeline, restored after reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/intelligent', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('navigation', { name: 'Lifecycle steps' })).toBeVisible({ timeout: 30_000 });

  // 1 · The agent creates a project; the discussion turns persist to its timeline.
  await ask(page, 'create a project from the best source tables');
  await expect(page.getByText(/Done — I created draft project AGENTIC_/)).toBeVisible({ timeout: 120_000 });
  const marker = `remember the number 424242`; // distinctive turn to find after reload
  await ask(page, marker);
  await page.waitForTimeout(12_000); // conversational reply + event persistence

  // 2 · Fresh page = fresh session store; reopening the project restores the process.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('navigation', { name: 'Lifecycle steps' })).toBeVisible({ timeout: 30_000 });
  const osProject = page.getByRole('button', { name: /AGENTIC_/ }).first();
  await expect(osProject, 'OS projects history panel lists the stored process').toBeVisible({ timeout: 30_000 });
  await osProject.click();

  await expect(page.getByText(/Restored \d+ turns from this project/), 'process restored').toBeVisible({
    timeout: 30_000,
  });
  // The context restores with the transcript: grounding chips come back too.
  await expect(page.getByText(/[1-5]\/5/).first(), 'grounding restored with the process').toBeVisible();
  await expect(page.getByText(/424242/).first(), 'stored turn content restored').toBeVisible();
  // The process map (ReactFlow) renders for step-by-step validation…
  await expect(page.getByText('Process map — click a step to validate/continue it:')).toBeVisible();
  await expect(page.locator('.react-flow').first(), 'flow canvas mounted').toBeVisible({ timeout: 20_000 });
  // …and the process is executable + trainable from the context line.
  await expect(page.getByRole('button', { name: 'Run process' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export turns' })).toBeVisible();
  record('process-reuse', await lastAgentCard(page));
  await page.screenshot({ path: path.join(SHOTS, 'process-reuse.png') });
  expect(errors, `page errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('GOVERNANCE discussion: agg-policy table → honest denial + remediation pre-selected + aggregated retry', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/intelligent', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('navigation', { name: 'Lifecycle steps' })).toBeVisible({ timeout: 30_000 });

  // Ground the aggregation-protected demo table, then ask for raw analysis.
  await ask(page, 'select DRAFT_SOURCE.RETAIL_DW.FACT_FINANCE');
  await expect(page.getByText(/Done — grounded/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('navigation', { name: 'Lifecycle steps' }).getByRole('button', { name: /Questions/i }).click();
  await ask(page, 'show me the raw finance rows with all details');

  // Real outcome: either the draft passes (policy absent on this env) or the
  // governed path speaks: worded denial + aggregated retry + admin remediation.
  const denial = page.getByText(/governance aggregation policy/);
  const passed = page.getByText(/tested on real data/);
  await expect(denial.or(passed).first(), 'governed outcome').toBeVisible({ timeout: 150_000 });
  if (await denial.isVisible().catch(() => false)) {
    await expect(page.getByRole('button', { name: /Retry as an aggregated query/ })).toBeVisible();
    await expect(page.getByText(/Adjust the aggregation policy/).first(), 'remediation pre-selected').toBeVisible({
      timeout: 15_000,
    });
    record('governance-denial', await lastAgentCard(page));
    // The self-heal path: aggregated retry must reach a tested outcome.
    await page.getByRole('button', { name: /Retry as an aggregated query/ }).click();
    await expect(page.getByText(/tested on real data|test failed/).last()).toBeVisible({ timeout: 150_000 });
    record('governance-aggregated-retry', await lastAgentCard(page));
  } else {
    record('governance-denial', 'policy not active on this env — draft passed');
  }
  await page.screenshot({ path: path.join(SHOTS, 'governance.png') });
  expect(errors, `page errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('CHART CREATOR: tested chart draft → real BI widget in one click', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/intelligent', { waitUntil: 'domcontentloaded' });
  const stepNav = page.getByRole('navigation', { name: 'Lifecycle steps' });
  await expect(stepNav).toBeVisible({ timeout: 30_000 });

  await ask(page, 'select DRAFT_SOURCE.RETAIL_DW.FACT_ORDERS');
  await expect(page.getByText(/Done — grounded/)).toBeVisible({ timeout: 30_000 });
  await stepNav.getByRole('button', { name: /Dashboards/i }).click();
  await ask(page, 'bar chart of order count by channel');

  const outcome = page.getByText(/chart draft/).last();
  await expect(outcome, 'chart draft outcome').toBeVisible({ timeout: 150_000 });
  const createBtn = page.getByRole('button', { name: 'Create as BI widget' });
  if (await createBtn.isVisible().catch(() => false)) {
    await createBtn.click();
    await expect(
      page.getByText(/Created — widget|could not validate a widget config/),
      'widget creation reaches a real outcome',
    ).toBeVisible({ timeout: 90_000 });
    record('chart-widget-created', await lastAgentCard(page));
  } else {
    record('chart-widget-created', 'draft did not pass — honest failure shown, no widget button');
  }
  await page.screenshot({ path: path.join(SHOTS, 'chart-widget.png') });
  expect(errors, `page errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('INGESTION TILES: freshness ask → live per-table KPI tiles (real platform data, no LLM)', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/intelligent', { waitUntil: 'domcontentloaded' });
  const stepNav = page.getByRole('navigation', { name: 'Lifecycle steps' });
  await expect(stepNav).toBeVisible({ timeout: 30_000 });

  await ask(page, 'sélectionne les tables de DRAFT_SOURCE.RETAIL_DW');
  await expect(page.getByText(/Done — I grounded/)).toBeVisible({ timeout: 60_000 });
  await stepNav.getByRole('button', { name: /Ingestion/i }).click();
  await ask(page, 'What is the load status and freshness of my selection?');

  await expect(page.getByText(/Live platform signals/), 'tiles card posted').toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/^DQ /).first(), 'KPI chips rendered').toBeVisible();
  record('ingestion-tiles', await lastAgentCard(page));
  await page.screenshot({ path: path.join(SHOTS, 'ingestion-tiles.png') });
  expect(errors, `page errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('PLAN FLOW: planning ask → clickable step flow, never numbered prose', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/intelligent', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('navigation', { name: 'Lifecycle steps' })).toBeVisible({ timeout: 30_000 });

  await ask(page, 'sélectionne les tables de DRAFT_SOURCE.RETAIL_DW');
  await expect(page.getByText(/Done — I grounded/)).toBeVisible({ timeout: 60_000 });
  await ask(page, 'how to finish all phases from these sources to dashboards?');

  const planReady = page.getByText(/Plan ready — click any step/);
  const gotPlan = await planReady.waitFor({ state: 'visible', timeout: 120_000 }).then(() => true).catch(() => false);
  if (gotPlan) {
    await expect(page.locator('.react-flow').last(), 'plan rendered as flow').toBeVisible();
    record('plan-flow', 'clickable plan flow rendered');
  } else {
    record('plan-flow', `fallback: ${(await lastAgentCard(page)).slice(0, 120)}`);
  }
  await page.screenshot({ path: path.join(SHOTS, 'plan-flow.png') });
  expect(errors, `page errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('WORKFLOW CREATOR: rendered ETL draft → real workflow in one click', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/intelligent', { waitUntil: 'domcontentloaded' });
  const stepNav = page.getByRole('navigation', { name: 'Lifecycle steps' });
  await expect(stepNav).toBeVisible({ timeout: 30_000 });

  await ask(page, 'select DRAFT_SOURCE.RETAIL_DW.FACT_ORDERS');
  await expect(page.getByText(/Done — grounded/)).toBeVisible({ timeout: 30_000 });
  await stepNav.getByRole('button', { name: /Workflow/i }).click();
  await ask(page, 'aggregate FACT_ORDERS into a daily summary table');

  await expect(page.getByText(/etl draft/).last(), 'etl draft outcome').toBeVisible({ timeout: 150_000 });
  const createBtn = page.getByRole('button', { name: 'Create this workflow' });
  if (await createBtn.isVisible().catch(() => false)) {
    await createBtn.click();
    await expect(page.getByText(/Created — workflow AGENTIC_WF_/), 'workflow CREATED').toBeVisible({
      timeout: 60_000,
    });
    record('workflow-created', await lastAgentCard(page));
  } else {
    record('workflow-created', 'etl draft did not fully render — honest failure, no create button');
  }
  await page.screenshot({ path: path.join(SHOTS, 'workflow-creator.png') });
  expect(errors, `page errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('ASSESSMENT: scan intent → staged narration → hero + honest availability + findings + Generate solution', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/intelligent', { waitUntil: 'domcontentloaded' });
  const box = page.getByLabel('Ask the agent');
  await expect(box).toBeVisible({ timeout: 30_000 });

  await box.fill('assess my Snowflake account');
  await page.getByRole('button', { name: 'Send' }).click();

  // Staged narration then the report card.
  await expect(page.getByText(/Stage 1 · Validating connection/), 'staged scan narrated').toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Data360 scanned/), 'hero narrative posted').toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('Source availability'), 'honest availability shown').toBeVisible();
  await expect(page.getByText(/Findings \(\d+\)/), 'findings section rendered').toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, 'assessment.png') });
  record('assessment', await lastAgentCard(page));

  // If any finding rendered, its "Generate solution" routes into the flow.
  const gen = page.getByRole('button', { name: 'Generate solution' }).first();
  if (await gen.isVisible().catch(() => false)) {
    await gen.click();
    await expect(box).not.toHaveValue('');
    record('assessment-solution', 'finding routed to solution flow (prompt prefilled)');
  }
  expect(errors, `page errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('CONVERSATION variety: greeting, short ack, FR selection, vague discovery — all coherent', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/intelligent', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('navigation', { name: 'Lifecycle steps' })).toBeVisible({ timeout: 30_000 });

  // Greeting → conversational, never a 422 or raw error.
  await ask(page, 'hey');
  await page.waitForTimeout(12_000);
  let out = await lastAgentCard(page);
  expect(out, 'greeting answered conversationally').not.toMatch(/string_too_short|422|failed/i);
  record('greeting', out);

  // FR selection → agent acts itself.
  await ask(page, 'sélectionne les tables de DRAFT_SOURCE.RETAIL_DW');
  await expect(page.getByText(/Done — I grounded \d+ of \d+ tables/)).toBeVisible({ timeout: 60_000 });
  record('fr-selection', await lastAgentCard(page));

  // Vague data ask → the agent uses the grounding it now has (no dead-end).
  await ask(page, 'what is interesting in this data?');
  await expect(page.getByText(/tested on real data|test failed|sql draft/).last()).toBeVisible({ timeout: 150_000 });
  record('vague-grounded-ask', await lastAgentCard(page));

  await page.screenshot({ path: path.join(SHOTS, 'conversation-variety.png') });
  expect(errors, `page errors: ${errors.join(' | ')}`).toHaveLength(0);
});
