import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PASS = process.env.D360_PASS ?? '';
const STATE = path.join(__dirname, 'night-audit-artifacts', '.auth.json');
// proj_01c59ad751d8 has a DRAFT_SOURCE with multiple schemas (RETAIL_DW +
// another) — so the "All schemas" affordance is applicable.
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
test.setTimeout(150_000);

test('catalog schema picker offers "All schemas (all products)"', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`/explore-design?project_id=${PROJECT}&view=catalog`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);

  // Open the schema multi-select dropdown.
  const schemaBtn = page.getByRole('button', { name: /schema(s)? selected|Select schemas/i }).first();
  await expect(schemaBtn, 'schema selector present').toBeVisible({ timeout: 30_000 });
  await schemaBtn.click();
  await page.waitForTimeout(1000);

  // The "All schemas (all products)" upstream affordance is offered.
  const allBtn = page.getByRole('button', { name: /All schemas \(all products\)|Clear all schemas/i }).first();
  await expect(allBtn, '"All schemas" affordance present').toBeVisible({ timeout: 10_000 });
  const before = (await schemaBtn.innerText()).trim();
  await allBtn.click();
  await page.waitForTimeout(2500);
  // Selecting all changes the "N schemas selected" count (all schemas now on).
  const after = (await page.getByRole('button', { name: /schema(s)? selected|Select schemas/i }).first().innerText()).trim();
  // eslint-disable-next-line no-console
  console.log(`ALLSCHEMAS before="${before}" after="${after}"`);
  expect(after, 'schema selection changed after All-schemas').not.toBe(before);
  expect(after, 'multiple schemas now selected').toMatch(/\d+ schemas selected/);

  expect(errors, `page errors: ${errors.slice(0, 4).join(' || ')}`).toEqual([]);
});
