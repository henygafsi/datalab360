/**
 * studio-view-kpis — the Sources and Access views lead with real business-KPI
 * strips fed by the served summary (null → "—"). Finality program (#136/#140).
 *
 * Run (repo root):
 *   D360_PASS=$(grep -m1 '^PAT:' apps/data360/.env | awk '{print $2}') \
 *     SHOTS=/abs/dir APP=proj_576e16333cdf \
 *     npx playwright test e2e/studio-view-kpis.spec.ts --project=demo-video
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

test('Sources & Access views lead with real KPI strips', async ({ browser }) => {
  test.skip(!PASS, 'D360_PASS required');
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  try {
    await login(page);
    await page.goto(`/studio/apps/${APP}`, { waitUntil: 'domcontentloaded' });

    // Sources
    await page.getByRole('tab', { name: 'Data' }).first().click({ timeout: 60_000 });
    await page.getByRole('tab', { name: 'Sources' }).first().click({ timeout: 30_000 });
    for (const label of ['Connected systems', 'Active objects', 'Source health score']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 60_000 });
    }
    console.log('[kpis] Sources strip present');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/kpis-sources.png`, fullPage: true });

    // Access
    await page.getByRole('tab', { name: 'Access' }).first().click({ timeout: 30_000 });
    for (const label of ['People with access', 'Active RLS rules', 'Encrypted columns', 'Risk level']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 60_000 });
    }
    console.log('[kpis] Access strip present (incl. encrypted columns + risk level)');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/kpis-access.png`, fullPage: true });

    // responsive
    for (const v of [
      { w: 1366, h: 768, tag: '1366' },
      { w: 390, h: 844, tag: '390' },
    ]) {
      await page.setViewportSize({ width: v.w, height: v.h });
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      console.log(`[kpis] ${v.tag} horizontal overflow = ${overflow}px`);
      expect(overflow, `no body overflow at ${v.tag}`).toBeLessThanOrEqual(2);
    }
  } finally {
    await context.close();
  }
});
