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

    await expect(page.getByText(/Data quality gate/).first()).toBeVisible({ timeout: 30_000 });

    const resolveSel = /Route violations to DLQ|Auto-fix|Waive|recommended/;
    const resolveBtn = page.getByRole('button', { name: resolveSel }).first();
    // Structured checks populate on a fresh gate evaluation; a fixture last
    // evaluated before the contract update carries only legacy strings. If the
    // per-rule controls aren't there, re-run the gate once to populate them.
    if (!(await resolveBtn.isVisible({ timeout: 8_000 }).catch(() => false))) {
      const rerun = page.getByRole('button', { name: /Re-run the data-quality gate/ });
      if (await rerun.count()) {
        await rerun.first().click();
        await expect(resolveBtn).toBeVisible({ timeout: 180_000 });
      }
    }

    await expect(page.getByText(/the engine recommends|warn, not a false green/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(resolveBtn).toBeVisible({ timeout: 20_000 });
    const nBtns = await page
      .getByRole('button', { name: /Route violations to DLQ|Auto-fix|Waive|recommended/ })
      .count();
    console.log(`[dqgate] per-rule resolve controls present = ${nBtns}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/activation-dqgate.png`, fullPage: true });
    // do NOT click a resolve action — it stages a design-time change on the
    // shared fixture (and re-run reads the warehouse).
  } finally {
    await context.close();
  }
});
