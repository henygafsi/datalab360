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
  await expect(
    page.getByText(/fact table|dimension|join key|star schema/i).first(),
    'star-schema ask reaches a concrete model answer',
  ).toBeVisible({ timeout: 150_000 });
  await page.waitForTimeout(1500);
  record('star-schema-on-project', await lastAgentCard(page));
  await page.screenshot({ path: path.join(SHOTS, 'star-schema.png') });

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
