/**
 * studio-report-filter-values — a report « in » filter offers the column's
 * real values in a real browser: focus the SOURCE_SYSTEM filter, the observed
 * value WMS appears (from /sources/values), clicking it scopes the report.
 *
 * Doubles as a no-regression check that the reporting view still renders and
 * runs after the filter-resolver change in StudioWorkspace.
 */
import { test, expect, type Page } from '@playwright/test';

const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';
const APP = process.env.APP ?? 'proj_d3922b1b628d';
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

test('report filter offers real values: SOURCE_SYSTEM → WMS, click scopes the report', async ({
  browser,
}) => {
  test.skip(!PASS, 'D360_PASS required');
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  const notes: string[] = [];
  try {
    await login(page);
    await page.goto(`/studio/apps/${APP}?view=reporting`, { waitUntil: 'domcontentloaded' });

    // the report renders its Filters section (no crash from the resolver)
    await expect(page.getByRole('region', { name: /Report filters/i })).toBeVisible({ timeout: 90_000 });
    notes.push('✓ reporting view renders the Filters section');

    // the SOURCE_SYSTEM « in » filter is the value combobox, not a blind box
    const combo = page.getByRole('combobox', { name: /SOURCE_SYSTEM/i }).first();
    await expect(combo).toBeVisible({ timeout: 30_000 });
    await combo.click(); // focus → reads /sources/values on intent (not on mount)

    // the observed value paints in the dropdown
    const wms = page.getByRole('listbox').getByText(/^WMS$/).first();
    await expect(wms).toBeVisible({ timeout: 30_000 });
    notes.push('✓ focusing the filter reads real values — WMS is offered');
    await page.screenshot({ path: `${OUT}/report-filter-values.png`, fullPage: false });

    // clicking it adds the chip
    await wms.click();
    await expect(page.getByRole('button', { name: /remove WMS/i })).toBeVisible({ timeout: 10_000 });
    notes.push('✓ clicking a value adds it as a filter chip');

    // Apply scopes the report (the honest summary names the applied filter)
    await page.getByRole('button', { name: /^Apply$/ }).click();
    await expect(page.getByText(/SOURCE_SYSTEM in/i)).toBeVisible({ timeout: 60_000 });
    notes.push('✓ Apply scopes the report — the summary names SOURCE_SYSTEM in');
  } finally {
    // eslint-disable-next-line no-console
    console.log('\nFILTER-VALUES NOTES:\n' + notes.join('\n'));
    await ctx.close();
  }
});
