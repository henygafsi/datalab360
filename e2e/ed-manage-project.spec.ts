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

test('header overflow → Manage project opens rename/delete dialog', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const log = (m: string) => console.log('MANAGE ' + m); // eslint-disable-line no-console

  await page.goto(`/explore-design?project_id=${PROJECT}&view=modeling`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);

  // Open the header overflow (⋮).
  const overflow = page.getByRole('button', { name: /More actions/i }).first();
  await expect(overflow, 'header overflow menu present').toBeVisible({ timeout: 20_000 });
  await overflow.click();
  await page.waitForTimeout(600);

  // "Manage project" item is now in the header overflow (project lifecycle in
  // the header, not buried in the right bar).
  const manageItem = page.getByRole('menuitem', { name: /Manage project/i }).first();
  await expect(manageItem, 'Manage project overflow item').toBeVisible({ timeout: 10_000 });
  await manageItem.click();
  await page.waitForTimeout(800);

  // The manage dialog hosts rename + delete (typed-name confirm on delete).
  const dialog = page.getByRole('dialog', { name: /Manage project/i });
  await expect(dialog, 'Manage project dialog open').toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByRole('button', { name: /Rename project/i }), 'rename affordance').toBeVisible();
  await expect(dialog.getByRole('button', { name: /Delete project/i }), 'delete affordance').toBeVisible();
  log('manage dialog open with rename + delete');

  // Open the delete confirm, then CANCEL (never actually delete the demo project).
  await dialog.getByRole('button', { name: /Delete project/i }).click();
  await page.waitForTimeout(600);
  const confirm = page.getByText(/This deletes the project/i);
  await expect(confirm, 'typed-name destructive confirm shown').toBeVisible({ timeout: 8_000 });
  log('delete confirm shown — cancelling (no real delete)');
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape').catch(() => {});

  await page.screenshot({ path: path.join(__dirname, 'night-audit-artifacts', 'manage-project.png') }).catch(() => {});
  log(`page errors (${errors.length}): ${errors.slice(0, 5).join(' || ')}`);
  expect(errors, 'no page errors').toEqual([]);
});
