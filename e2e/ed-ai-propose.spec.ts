import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PASS = process.env.D360_PASS ?? '';
const STATE = path.join(__dirname, 'night-audit-artifacts', '.auth.json');
const PROJECT = process.env.ED_PROJECT ?? 'proj_27fcf868068a';
fs.mkdirSync(path.dirname(STATE), { recursive: true });
if (!fs.existsSync(STATE)) fs.writeFileSync(STATE, JSON.stringify({ cookies: [], origins: [] }));

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

test.use({ storageState: STATE });
test.setTimeout(240_000);

test('AI Assist: agent proposes gated actions for the selected table', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const log = (m: string) => console.log('AIPROPOSE ' + m); // eslint-disable-line no-console

  await page.goto(`/explore-design?project_id=${PROJECT}&view=modeling`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);

  // Select a source table from the left rail → sets the inspected table and
  // opens the modeling right bar (handleTableClick). The model canvas may be
  // empty (0 modeled tables); the source rail always lists real tables.
  const row = page.getByTestId('source-table-row').first();
  await expect(row, 'at least one source table row').toBeVisible({ timeout: 30_000 });
  await row.click();
  await page.waitForTimeout(1500);

  // Open the AI Assist axis.
  const aiTab = page.getByRole('tab', { name: /AI Assist/i }).first();
  await expect(aiTab, 'AI Assist tab present').toBeVisible({ timeout: 15_000 });
  await aiTab.click();
  await page.waitForTimeout(1200);

  // The headline agentic CTA.
  const analyzeBtn = page.getByRole('button', { name: /Analyze this table/i }).first();
  await expect(analyzeBtn, 'Analyze this table CTA present').toBeVisible({ timeout: 15_000 });
  await analyzeBtn.click();
  log('clicked Analyze — waiting for proposals or unavailable');

  // Assert a REAL outcome: either proposal cards render, or an explicit
  // unavailable status. Never merely "no error" (a dead endpoint must fail).
  const proposals = page.getByTestId('agent-proposals');
  const unavailable = page.getByText(/aren't available on this backend/i);
  await expect(proposals.or(unavailable)).toBeVisible({ timeout: 120_000 });

  const gotProposals = await proposals.isVisible().catch(() => false);
  if (gotProposals) {
    const cards = proposals.locator('> div');
    const n = await cards.count();
    log(`proposals rendered: ${n} action card(s)`);
    expect(n, 'at least one proposed action').toBeGreaterThan(0);
    // At least one card should carry a risk badge (low/medium/high).
    await expect(proposals.getByText(/^(low|medium|high)$/i).first()).toBeVisible();
  } else {
    log('agent proposals unavailable on this backend (honest disabled state)');
  }

  await page.screenshot({ path: path.join(__dirname, 'night-audit-artifacts', 'ai-propose.png') }).catch(() => {});
  log(`page errors (${errors.length}): ${errors.slice(0, 5).join(' || ')}`);
  expect(errors, 'no page errors').toEqual([]);
});

test('AI Model button opens the AI tab and analyzes the whole model (no table selected)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const log = (m: string) => console.log('AIMODEL ' + m); // eslint-disable-line no-console

  await page.goto(`/explore-design?project_id=${PROJECT}&view=modeling`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);

  // The header "AI Model" button now opens the AI Assist right-bar tab (inline
  // agentic analysis), matching the Workflow AI Build pattern — not a modal.
  const aiModelBtn = page.getByRole('button', { name: /^AI Model$/ }).first();
  await expect(aiModelBtn, 'AI Model header button present').toBeVisible({ timeout: 20_000 });
  await aiModelBtn.click();
  await page.waitForTimeout(1500);

  // No modal wizard should appear — it's an inline tab now.
  const wizardTitle = page.getByText(/AI-Guided Modeling/i);
  await expect(wizardTitle, 'no modal wizard — inline tab instead').toHaveCount(0);

  // Project-level analyze CTA in the AI tab.
  const analyzeModel = page.getByRole('button', { name: /Analyze this model/i }).first();
  await expect(analyzeModel, 'project-level Analyze this model CTA').toBeVisible({ timeout: 15_000 });
  await analyzeModel.click();
  log('clicked Analyze this model — waiting for proposals or unavailable');

  const proposals = page.getByTestId('agent-proposals');
  const unavailable = page.getByText(/aren't available on this backend/i);
  await expect(proposals.or(unavailable)).toBeVisible({ timeout: 120_000 });

  const gotProposals = await proposals.isVisible().catch(() => false);
  if (gotProposals) {
    const n = await proposals.locator('> div').count();
    log(`model-level proposals rendered: ${n} action card(s)`);
    expect(n, 'at least one proposed action').toBeGreaterThan(0);
  } else {
    log('model-level proposals unavailable (honest disabled state)');
  }

  await page.screenshot({ path: path.join(__dirname, 'night-audit-artifacts', 'ai-model-tab.png') }).catch(() => {});
  log(`page errors (${errors.length}): ${errors.slice(0, 5).join(' || ')}`);
  expect(errors, 'no page errors').toEqual([]);
});
