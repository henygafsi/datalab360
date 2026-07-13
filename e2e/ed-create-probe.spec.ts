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

test('probe: create-table flow in E&D modeling', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console:' + m.text().slice(0, 120)); });
  await page.goto(`/explore-design?project_id=${PROJECT}&view=modeling`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);

  const log = (m: string) => console.log('PROBE ' + m); // eslint-disable-line no-console

  // 1. Bottom "Create Table" quick action
  const createTableBtn = page.getByRole('button', { name: /^Create Table$/ }).first();
  const ctVisible = await createTableBtn.isVisible().catch(() => false);
  const ctEnabled = ctVisible ? await createTableBtn.isEnabled().catch(() => false) : false;
  log(`bottom "Create Table": visible=${ctVisible} enabled=${ctEnabled}`);
  expect(ctVisible && ctEnabled, 'bottom Create Table is clickable').toBeTruthy();
  await createTableBtn.click().catch((e) => log('click err ' + e));
  await page.waitForTimeout(2500);
  // FIX: the bottom "Create Table" must now open the create MODAL directly
  // (it used to only open the right-bar group → looked like nothing happened).
  const dialog = await page.getByRole('dialog').count();
  log(`after click Create Table → dialogs=${dialog}`);
  await page.screenshot({ path: path.join(__dirname, 'night-audit-artifacts', 'probe-create-table.png') }).catch(() => {});
  expect(dialog, 'Create Table opens a modal directly').toBeGreaterThan(0);
  // close it before the next step
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(800);

  log(`page errors (${errors.length}): ${errors.slice(0, 5).join(' || ')}`);
  expect(errors, 'no page/console errors').toEqual([]);
});

test('DAG Viewer removed from modeling; quick actions + Lineage intact', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/explore-design?project_id=${PROJECT}&view=modeling`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);

  const quick = page.getByTestId('modeling-quick-actions');
  await expect(quick).toBeVisible({ timeout: 30_000 });
  // DAG Viewer is gone; the remaining quick actions are intact.
  await expect(quick.getByRole('button', { name: /DAG Viewer/i })).toHaveCount(0);
  await expect(quick.getByRole('button', { name: /^Create Table$/ })).toBeVisible();
  await expect(quick.getByRole('button', { name: /Ingestion Run/i })).toBeVisible();
  await expect(quick.getByRole('button', { name: /AI Recommendations/i })).toBeVisible();
  // eslint-disable-next-line no-console
  console.log('DAGREMOVE quick actions intact, DAG Viewer button count = 0');
  expect(errors, 'no page errors').toEqual([]);
});
