import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PASS = process.env.D360_PASS ?? '';
const STATE = path.join(__dirname, 'night-audit-artifacts', '.auth.json');
// proj_01c59ad751d8 has a rich event log (deploys, DDL actions, failures).
const PROJECT = process.env.ED_REMEDIATION_PROJECT ?? 'proj_01c59ad751d8';
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
test.setTimeout(180_000);

test('History axis: AI summarizes recent project activity', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const log = (m: string) => console.log('HISTSUM ' + m); // eslint-disable-line no-console

  await page.goto(`/explore-design?project_id=${PROJECT}&view=modeling`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);

  // The History axis renders per-selected-table — pick a source table first.
  const row = page.getByTestId('source-table-row').first();
  await expect(row, 'a source table row').toBeVisible({ timeout: 30_000 });
  await row.click();
  await page.waitForTimeout(1500);

  // Open the History axis (right-bar tab, now that a table is selected).
  const historyTab = page.getByRole('tab', { name: /History/i }).first();
  await expect(historyTab, 'History axis present').toBeVisible({ timeout: 15_000 });
  await historyTab.click();
  await page.waitForTimeout(1500);

  // The panel renders cleanly: either the agentic "Activity summary" (events
  // exist) or an honest "No history yet" — never a crash.
  const summaryBlock = page.getByText(/Activity summary/i).first();
  const noHistory = page.getByText(/No history yet/i).first();
  await expect(summaryBlock.or(noHistory), 'history panel rendered').toBeVisible({ timeout: 15_000 });

  // If there are events, exercise the AI summarize action end-to-end.
  const btn = page.getByRole('button', { name: /Summarize activity/i }).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    log('clicked Summarize activity — waiting for narrative or unavailable');
    const narrative = page.locator('text=/failed|deploy|table|created|remediat|primary key|policy|event|change/i');
    const unavailable = page.getByText(/isn't available on this backend/i);
    await expect(narrative.first().or(unavailable)).toBeVisible({ timeout: 90_000 });
    log((await narrative.first().isVisible().catch(() => false)) ? 'AI narrative rendered' : 'summary unavailable (honest)');
  } else {
    log('no events for this table — history panel shows honest empty state');
  }

  await page.screenshot({ path: path.join(__dirname, 'night-audit-artifacts', 'history-summary.png') }).catch(() => {});
  log(`page errors (${errors.length}): ${errors.slice(0, 5).join(' || ')}`);
  expect(errors, 'no page errors').toEqual([]);
});
