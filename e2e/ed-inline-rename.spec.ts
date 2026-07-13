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
test.setTimeout(180_000);

test('project name is inline-editable in the header (rename → save → restore)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const log = (m: string) => console.log('RENAME ' + m); // eslint-disable-line no-console

  await page.goto(`/explore-design?project_id=${PROJECT}&view=modeling`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);

  // The header shows the project name as an inline-editable control (no dialog).
  const nameBtn = page.locator('button[title="Click to rename this project"]').first();
  await expect(nameBtn, 'inline-editable project name in header').toBeVisible({ timeout: 30_000 });
  const original = (await nameBtn.innerText()).trim();
  log(`original name: "${original}"`);
  expect(original.length, 'name is non-empty').toBeGreaterThan(0);

  const temp = `${original}_E2E`;
  await nameBtn.click();
  const input = page.getByRole('textbox', { name: /Project name/i }).first();
  await expect(input, 'name input appears on click').toBeVisible({ timeout: 8_000 });
  await input.fill(temp);
  await input.press('Enter');
  // Success toast + the header reflects the new name.
  await expect(page.getByText(/Project renamed/i), 'rename success toast').toBeVisible({ timeout: 15_000 });
  await expect(page.locator('button[title="Click to rename this project"]').first()).toContainText('_E2E', { timeout: 10_000 });
  log('renamed inline + persisted');

  // Restore the original name so the fixture project is unchanged.
  const nameBtn2 = page.locator('button[title="Click to rename this project"]').first();
  await nameBtn2.click();
  const input2 = page.getByRole('textbox', { name: /Project name/i }).first();
  await input2.fill(original);
  await input2.press('Enter');
  await expect(page.getByText(/Project renamed/i)).toBeVisible({ timeout: 15_000 });
  log(`restored name to "${original}"`);

  log(`page errors (${errors.length}): ${errors.slice(0, 5).join(' || ')}`);
  expect(errors, 'no page errors').toEqual([]);
});
