/**
 * governance-role-membership — the Governance hub's "By Data360 role" tab:
 * the account's users (and warehouse roles) bucketed into the seven-role Data360
 * taxonomy, resolved from server truth. People axis = an authoritative partition;
 * Warehouse-roles axis = an observed, flagged inference.
 */
import { test, expect, type Page } from '@playwright/test';

const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';
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

test('governance: users bucketed by Data360 role, both axes, honestly', async ({ browser }) => {
  test.skip(!PASS, 'D360_PASS required');
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
  const page = await ctx.newPage();
  const notes: string[] = [];
  try {
    await login(page);
    await page.goto('/governance', { waitUntil: 'domcontentloaded' });

    const tab = page.getByRole('tab', { name: /By Data360 role/i });
    await expect(tab).toBeVisible({ timeout: 60_000 });
    await tab.click();
    notes.push('✓ "By Data360 role" tab present in the governance hub');

    await expect(page.getByRole('heading', { name: /Who holds each Data360 role/i })).toBeVisible({
      timeout: 60_000,
    });
    // the taxonomy buckets — Admin is one of the seven fixed roles
    await expect(page.getByRole('heading', { name: 'Admin', exact: true }).first()).toBeVisible({
      timeout: 60_000,
    });
    notes.push('✓ users bucketed into the Data360 role taxonomy (Admin bucket rendered)');

    // the people axis states the partition honesty (one group per user)
    await expect(page.getByText(/every user appears in exactly one group/i)).toBeVisible();
    notes.push('✓ people axis is stated as an authoritative partition');
    await page.waitForTimeout(5000); // let per-user resolution stream in
    await page.screenshot({ path: `${OUT}/gov-byrole-people.png`, fullPage: false });

    // warehouse axis: the observed, flagged inference
    await page.getByRole('tab', { name: /Warehouse roles/i }).click();
    await expect(page.getByText(/Resolves to \(observed\)/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Observed, not definitive/i)).toBeVisible();
    notes.push('✓ warehouse axis flagged observed-not-definitive (no invented mapping)');
    await page.screenshot({ path: `${OUT}/gov-byrole-warehouse.png`, fullPage: false });
  } finally {
    // eslint-disable-next-line no-console
    console.log('\nBYROLE NOTES:\n' + notes.join('\n'));
    await ctx.close();
  }
});
