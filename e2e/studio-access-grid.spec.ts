/**
 * studio-access-grid — the Access governance surface is now ONE navigable page:
 * a columns × roles matrix, navigable by grant type (Row rules / Column masking
 * / PII·GDPR), replacing the "palette" of column cards. PII detection runs the
 * detect → confirm → mask path in the same grid.
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

test('access grid: matrix + grant-type navigator + PII detect→confirm', async ({ browser }) => {
  test.skip(!PASS, 'D360_PASS required');
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
  const page = await ctx.newPage();
  const notes: string[] = [];
  try {
    await login(page);
    await page.goto(`/studio/apps/${APP}?view=access`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Data profiles|People with access/i).first()).toBeVisible({ timeout: 90_000 });

    // open Advanced governance if it is collapsed
    const adv = page.getByText(/Advanced governance/i).first();
    if (await adv.isVisible().catch(() => false)) await adv.click().catch(() => undefined);

    // « Give access » (person-first) is now the default — open the grid tab
    await page.getByRole('tab', { name: /Access grid/i }).first().click();
    await expect(page.getByText(/Access grid — columns × roles/i).first()).toBeVisible({ timeout: 60_000 });
    notes.push('✓ the Access grid renders (columns × roles)');

    // the grant-type navigator — navigable BY grant type
    await expect(page.getByRole('tab', { name: /Row rules \(RLS\)/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Column masking \(CLS\)/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /PII \/ GDPR/i })).toBeVisible();
    notes.push('✓ grant-type navigator: Row rules / Column masking / PII·GDPR');
    await page.screenshot({ path: `${OUT}/access-grid-rows.png`, fullPage: false });

    // Column masking layer: the shared exemption header + role toggles
    await page.getByRole('tab', { name: /Column masking \(CLS\)/i }).click();
    await expect(page.getByText(/Seen in clear by/i).first()).toBeVisible({ timeout: 30_000 });
    notes.push('✓ masking layer shows the shared "seen in clear by" exemption');
    await page.screenshot({ path: `${OUT}/access-grid-masking.png`, fullPage: false });

    // PII / GDPR layer: detect → a finding with a decision
    await page.getByRole('tab', { name: /PII \/ GDPR/i }).click();
    const detect = page.getByRole('button', { name: /Detect PII \/ GDPR|Re-detect/i }).first();
    await expect(detect).toBeVisible({ timeout: 30_000 });
    await detect.click();
    // a proposed finding shows "Confirm & mask" (mask action) or "Confirm" (row-restrict)
    await expect(page.getByRole('button', { name: /Confirm & mask|^Confirm$/ }).first()).toBeVisible({
      timeout: 90_000,
    });
    notes.push('✓ PII detect surfaces confirmable findings (detect→confirm→mask path)');
    // the honesty line: a name match is a proposal, detection ≠ compliance
    await expect(page.getByText(/proposal to confirm|not.*GDPR|one control/i).first()).toBeVisible();
    notes.push('✓ honest framing: a proposal, not asserted compliance');
    await page.screenshot({ path: `${OUT}/access-grid-pii.png`, fullPage: false });
  } finally {
    // eslint-disable-next-line no-console
    console.log('\nACCESS-GRID NOTES:\n' + notes.join('\n'));
    await ctx.close();
  }
});
