import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PASS = process.env.D360_PASS ?? '';
const STATE = path.join(__dirname, 'night-audit-artifacts', '.auth.json');
const PROJECT = 'proj_01c59ad751d8';
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
test.setTimeout(120_000);

test('AI Suggest Columns renders columns (no "AI suggestion failed")', async ({ page }) => {
  await page.goto(`/explore-design?project_id=${PROJECT}&view=catalog`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);

  // Open Create Standard Table via the right-rail Create → Standard table CTA.
  await page.getByText(/^Standard table$/i).first().click({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await expect(page.getByText(/Create Standard Table/i).first(), 'modal open').toBeVisible({ timeout: 15000 });

  // Fill the Table Name field (first textbox in the panel).
  const nameField = page.getByPlaceholder('e.g., DIM_CUSTOMER').first();
  await nameField.fill('FACT_QA_SUGGEST_XZ9');
  await page.waitForTimeout(300);

  // Click Suggest Columns.
  await page.getByRole('button', { name: /Suggest Columns/i }).first().click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(10000); // AI round-trip

  const failed = await page.getByText(/AI suggestion failed/i).count();
  const header = await page.getByText(/AI Suggested Columns/i).count();
  const anyCol = await page.getByText(/FACT_SK|DATE_KEY|AMOUNT|CREATED_AT/i).count();
  // eslint-disable-next-line no-console
  console.log('AISUGGEST failed=', failed, 'header=', header, 'anyCol=', anyCol);
  await page.screenshot({ path: path.join(__dirname, 'night-audit-artifacts', 'ai-suggest.png') }).catch(() => {});
  expect(failed, 'no AI suggestion failed toast').toBe(0);
  expect(header + anyCol, 'AI suggested columns rendered').toBeGreaterThan(0);
});
