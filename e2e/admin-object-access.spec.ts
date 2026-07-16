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

test('Access tab surfaces the real object-access matrix (who can touch each object)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/administration?tab=access', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);

  const panel = page.getByTestId('object-access-matrix-panel');
  await expect(panel, 'object access matrix panel present').toBeVisible({ timeout: 30_000 });
  await expect(panel.getByRole('heading', { name: /Object Access Matrix/i })).toBeVisible();

  // Real users render as expandable rows — expand the first and see a privilege
  // badge. The object-permission-matrix aggregates real SHOW GRANTS, a heavy
  // query, so give the rows a generous window (esp. under parallel CI load).
  const firstUser = panel.locator('button').filter({ hasText: /object/i }).first();
  await expect(firstUser, 'a user row').toBeVisible({ timeout: 40_000 });
  await firstUser.click();
  await page.waitForTimeout(500);
  await expect(panel.getByText(/^(SELECT|USAGE|OWNERSHIP|INSERT)$/).first(), 'a real privilege badge').toBeVisible({ timeout: 8_000 });
  // eslint-disable-next-line no-console
  console.log('OBJACCESS matrix rendered + expanded a user with privileges');

  expect(errors, `page errors: ${errors.slice(0, 4).join(' || ')}`).toEqual([]);
});
