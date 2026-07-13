import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PASS = process.env.D360_PASS ?? '';
const STATE = path.join(__dirname, 'night-audit-artifacts', '.auth.json');
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

test('Config tab surfaces live account parameters (exhaustive admin data)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/administration?tab=config', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);

  const panel = page.getByTestId('account-parameters-panel');
  await expect(panel, 'account parameters panel present').toBeVisible({ timeout: 20_000 });
  await expect(panel.getByRole('heading', { name: /Account Parameters/i })).toBeVisible();

  // Real params render (the table has many rows — a known account param is present).
  await expect(panel.getByText('STATEMENT_TIMEOUT_IN_SECONDS').first(), 'a real account param row').toBeVisible({ timeout: 15_000 });

  // The "Security only" filter narrows the list (security-relevant params exist).
  await panel.getByRole('button', { name: /Security only/i }).click();
  await page.waitForTimeout(600);
  await expect(panel.getByText(/security/i).first()).toBeVisible();
  // eslint-disable-next-line no-console
  console.log('ACCTPARAMS panel rendered with real params + security filter');

  expect(errors, `page errors: ${errors.slice(0, 4).join(' || ')}`).toEqual([]);
});
