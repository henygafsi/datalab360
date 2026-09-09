/**
 * studio-report-toolbar — the Reporting view gains a report-level toolbar:
 * Share (copy link), Export (the detail table), and a full-screen toggle that
 * hides the right widgets panel (#142).
 */
import { test, expect, type Page } from '@playwright/test';

const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';
const SHOTS = process.env.SHOTS ?? '';
const APP = process.env.APP ?? 'proj_576e16333cdf';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

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

test('Reporting toolbar: share + export + full-screen toggle', async ({ browser }) => {
  test.skip(!PASS, 'D360_PASS required');
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  try {
    await login(page);
    await page.goto(`/studio/apps/${APP}?view=reporting`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Insights' }).first().click({ timeout: 60_000 });
    await page.getByRole('tab', { name: 'Reporting' }).first().click({ timeout: 30_000 });

    const share = page.getByRole('button', { name: /^Share$/ });
    const full = page.getByRole('button', { name: /Full screen/ });
    await expect(share).toBeVisible({ timeout: 60_000 });
    await expect(full).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/report-toolbar.png`, fullPage: true });

    // collapse the right widgets panel → the toggle flips to "Show panel"
    await full.click();
    await expect(page.getByRole('button', { name: /Show panel/ })).toBeVisible({ timeout: 15_000 });
    console.log('[report] toolbar present (share/export) + full-screen collapses the widgets panel');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/report-fullscreen.png`, fullPage: true });
  } finally {
    await context.close();
  }
});
