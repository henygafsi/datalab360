/**
 * studio-access-review — the Access « Review & apply » reads as decisions
 * (Who gets in / What data they read / Row rules / Column masking), collapsed
 * to a summary, with one explicit apply and a per-operation outcome.
 */
import { test, expect, type Page } from '@playwright/test';

const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';
const APP = process.env.APP ?? 'proj_576e16333cdf';
const OUT = process.env.OUT ?? 'e2e/results';

test.setTimeout(240_000);

async function login(p: Page) {
  await p.goto('/signin', { waitUntil: 'domcontentloaded' });
  await p.locator('input[name="account_name"], input#account_name').first().fill(ACCOUNT);
  await p.locator('input[name="username"], input#username').first().fill(USER);
  await p.locator('input[type="password"]').first().fill(PASS);
  await p.locator('button[type="submit"]').first().click();
  const deadline = Date.now() + 90_000;
  for (;;) {
    const s = await p.request.get('/api/auth/session').then((r) => r.json()).catch(() => null);
    if (s?.user?.access_token) return;
    if (Date.now() > deadline) throw new Error('login timeout');
    await p.waitForTimeout(1200);
  }
}

test('access review: decision categories, collapsed, explicit apply, dry-run outcome', async ({
  browser,
}) => {
  test.skip(!PASS, 'D360_PASS required');
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
  const page = await ctx.newPage();
  const notes: string[] = [];
  try {
    await login(page);
    await page.goto(`/studio/apps/${APP}?view=access`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Data profiles|People with access/i).first()).toBeVisible({ timeout: 90_000 });
    notes.push('✓ Access tab renders');

    // open Advanced governance if collapsed
    const adv = page.getByText(/Advanced governance/i).first();
    if (await adv.isVisible().catch(() => false)) {
      await adv.click().catch(() => undefined);
    }

    // MAP a principal: click a person in the left list, then a role in the detail
    await page.getByText('AI_ENGINEER_TEST', { exact: false }).first().click();
    await page.waitForTimeout(800);
    // pick the "View" role card by its unique description text
    await page.getByText(/open the application, read its reports/i).first().click();
    await page.waitForTimeout(600);
    notes.push('· selected the View role card');

    const prepare = page.getByRole('button', { name: /Prepare the change/i });
    await expect(prepare).toBeVisible({ timeout: 30_000 });
    await expect(prepare).toBeEnabled({ timeout: 15_000 });
    await prepare.click();
    notes.push('✓ mapped a principal and prepared the change');

    // go to the Review & apply sub-tab
    await page.getByRole('button', { name: /Review & apply/i }).first().click();

    // decision-shaped summary — the category headers, not SQL verbs
    const readCat = page.getByRole('button', { name: /What data they read/i });
    await expect(readCat).toBeVisible({ timeout: 60_000 });
    notes.push('✓ review groups by decision (What data they read)');
    await expect(page.getByRole('button', { name: /Apply all \d+ operation/i })).toBeVisible();
    notes.push('✓ one explicit primary — Apply all N operations');
    await page.screenshot({ path: `${OUT}/access-review-collapsed.png`, fullPage: false });

    // expand a category → its lines appear
    await readCat.click();
    await expect(page.getByText(/line\(s\)|grant/i).first()).toBeVisible({ timeout: 15_000 });
    notes.push('✓ expanding a category reveals its operations');

    // dry run → per-operation outcome panel
    await page.getByRole('button', { name: /^Dry run$/ }).click();
    await expect(page.getByText(/would apply|Nothing changed/i).first()).toBeVisible({ timeout: 60_000 });
    notes.push('✓ dry run shows the per-operation outcome (would apply)');
    await page.screenshot({ path: `${OUT}/access-review-outcome.png`, fullPage: false });
  } finally {
    // eslint-disable-next-line no-console
    console.log('\nACCESS-REVIEW NOTES:\n' + notes.join('\n'));
    await ctx.close();
  }
});
