/**
 * studio-report-skipped-filter — a dataset-bound page filter that misses some
 * widgets is surfaced honestly, not silently dropped. On proj_576e16333cdf the
 * CHANNEL filter resolves to FACT_TRANSACTIONS; applying it scopes the 6 fact
 * widgets and the amber note reports the 6 widgets it did NOT reach.
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

test('report: a dataset-bound filter surfaces the widgets it did not reach', async ({ browser }) => {
  test.skip(!PASS, 'D360_PASS required');
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
  const page = await ctx.newPage();
  const notes: string[] = [];
  try {
    await login(page);
    await page.goto(`/studio/apps/${APP}?view=reporting`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('region', { name: /Report filters/i })).toBeVisible({ timeout: 90_000 });

    // set the CHANNEL filter to WEB — pick from observed values, else type it
    const combo = page.getByRole('combobox', { name: /CHANNEL/i }).first();
    await expect(combo).toBeVisible({ timeout: 30_000 });
    await combo.click();
    const web = page.getByRole('listbox').getByText(/^WEB$/i).first();
    if (await web.isVisible({ timeout: 8000 }).catch(() => false)) {
      await web.click();
    } else {
      await combo.fill('WEB');
      await combo.press('Enter');
    }
    await expect(page.getByRole('button', { name: /remove WEB/i })).toBeVisible({ timeout: 10_000 });
    notes.push('✓ CHANNEL = WEB staged');

    await page.getByRole('button', { name: /^Apply$/ }).click();

    // the honest amber note: CHANNEL is dataset-bound and missed 6 widgets
    await expect(page.getByText(/scoped to its dataset/i).first()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/CHANNEL/).first()).toBeVisible();
    await expect(page.getByText(/apply to 6 widget/i).first()).toBeVisible({ timeout: 30_000 });
    notes.push('✓ amber note: "CHANNEL · FACT_TRANSACTIONS — didn’t apply to 6 widgets"');
    await page.screenshot({ path: `${OUT}/report-skipped-filter.png`, fullPage: false });
  } finally {
    // eslint-disable-next-line no-console
    console.log('\nSKIPPED-FILTER NOTES:\n' + notes.join('\n'));
    await ctx.close();
  }
});
