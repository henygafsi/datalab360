import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Verifies the Workflow smart-panel RoleContextChip parity with Explore & Design:
 * the capability tier (Owner/Editor/Viewer) renders in the panel header with no
 * uncaught page errors.
 *
 * Run: D360_PASS=... npx playwright test e2e/workflow-role-chip.spec.ts --reporter=line
 */
const PASS = process.env.D360_PASS ?? '';
const SHOTS = path.join(__dirname, 'workflow-role-chip-artifacts');
fs.mkdirSync(SHOTS, { recursive: true });

// The builder (and its smart panel) only mounts on a desktop-width viewport;
// a narrow viewport renders the MobileNotice instead.
test.use({ viewport: { width: 1600, height: 950 } });

async function signIn(page: Page) {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });
}

test('workflow smart panel shows the capability tier chip, no page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await signIn(page);
  await page.goto('/workflow');
  // /workflow is a chooser; the builder + smart panel mount only after opening an
  // existing workflow from the list.
  await page.waitForTimeout(4000);
  await page
    .getByText(/Token Check|Returns Integrity Gate|Bad reviews sentiment/i)
    .first()
    .click({ timeout: 30_000 });
  await page.waitForSelector('[aria-label="Workflow smart panel"]', { timeout: 60_000 });

  const chip = page.getByText(/\b(Owner|Editor|Viewer)\b · (can deploy|can edit|read-only)/).first();
  await expect(chip).toBeVisible({ timeout: 15_000 });
  const chipText = await chip.textContent();

  await page.screenshot({ path: path.join(SHOTS, 'workflow-panel.png'), fullPage: false });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ chipText, pageErrors: errors }, null, 2));

  expect(errors, `uncaught page errors: ${errors.join('; ')}`).toHaveLength(0);
});
