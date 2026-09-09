/**
 * studio-activation-dqgate — the blocked activation gate now offers an
 * in-place "Re-run the data-quality gate" action + the standardized-DQ
 * resolution guidance (fix, or route violating rows to the DLQ), so a
 * resolved application can turn green without leaving. Presence only — the
 * button is NOT clicked (re-run reads the warehouse).
 *
 * Run (repo root):
 *   D360_PASS=$(grep -m1 '^PAT:' apps/data360/.env | awk '{print $2}') \
 *     SHOTS=/abs/dir APP=proj_576e16333cdf \
 *     npx playwright test e2e/studio-activation-dqgate.spec.ts --project=demo-video
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

test('blocked activation gate offers re-run + resolution guidance', async ({ browser }) => {
  test.skip(!PASS, 'D360_PASS required');
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  try {
    await login(page);
    await page.goto(`/studio/apps/${APP}`, { waitUntil: 'domcontentloaded' });
    // the activation panel is collapsed by default — expand it
    const toggle = page.getByRole('button', { name: /Activation panel/ });
    await expect(toggle).toBeVisible({ timeout: 60_000 });
    await toggle.click();

    const rerun = page.getByRole('button', { name: /Re-run the data-quality gate/ });
    await expect(page.getByText(/Data quality gate/).first()).toBeVisible({ timeout: 30_000 });
    // the gate is blocked in this fixture → the re-run action + guidance show
    await expect(rerun).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/route the violating records to\s+the DLQ/i).first()).toBeVisible();
    console.log('[dqgate] re-run action + DLQ/fix guidance present on the blocked gate');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/activation-dqgate.png`, fullPage: true });
    // do NOT click re-run — it reads the warehouse.
  } finally {
    await context.close();
  }
});
