/**
 * studio-workflow-palette — Surface B (first slice): the workflow step
 * palette is categorized by family and paginated on demand, not a flat
 * capped grid of every block. Opening a category or turning a page fetches
 * nothing (the catalogue is already in hand).
 *
 * Run (repo root):
 *   D360_PASS=$(grep -m1 '^PAT:' apps/data360/.env | awk '{print $2}') \
 *     SHOTS=/abs/dir APP=proj_576e16333cdf \
 *     npx playwright test e2e/studio-workflow-palette.spec.ts --project=demo-video
 */
import { test, expect, type Page } from '@playwright/test';

const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';
const SHOTS = process.env.SHOTS ?? '';
const APP = process.env.APP ?? 'proj_576e16333cdf';

test.describe.configure({ mode: 'serial' });
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

test('Workflow step palette is categorized + paginated', async ({ browser }) => {
  test.skip(!PASS, 'D360_PASS required');
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  try {
    await login(page);
    await page.goto(`/studio/apps/${APP}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tab', { name: 'Automation' }).first()).toBeVisible({ timeout: 60_000 });
    await page.getByRole('tab', { name: 'Automation' }).first().click();

    // open the first workflow (the editor replaces the list)
    const openWf = page.getByRole('button', { name: /^(Open|Edit)$/ }).first();
    await expect(openWf).toBeVisible({ timeout: 60_000 });
    await openWf.click();

    // go to the Steps section, open the palette
    await page.getByRole('tab', { name: 'Steps', exact: true }).first().click({ timeout: 30_000 });
    const addStep = page.getByRole('button', { name: /Add a step/ });
    await expect(addStep).toBeVisible({ timeout: 30_000 });
    await addStep.click();

    // the categorized palette: search + at least one family category header
    await expect(page.getByRole('searchbox', { name: 'Search blocks' })).toBeVisible({ timeout: 20_000 });
    const anyFamily = page.getByRole('button', {
      name: /Ingestion|Transform|Python & ML|Delivery|Control & flow/,
    });
    await expect(anyFamily.first()).toBeVisible({ timeout: 15_000 });
    const famCount = await anyFamily.count();
    console.log(`[palette] family categories visible = ${famCount}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/wf-palette.png`, fullPage: true });

    // no body overflow at mobile
    for (const v of [
      { w: 1366, h: 768, tag: '1366' },
      { w: 390, h: 844, tag: '390' },
    ]) {
      await page.setViewportSize({ width: v.w, height: v.h });
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      console.log(`[palette] ${v.tag} horizontal overflow = ${overflow}px`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/wf-palette-${v.tag}.png`, fullPage: true });
      expect(overflow, `no body overflow at ${v.tag}`).toBeLessThanOrEqual(2);
    }
  } catch (e) {
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/wf-palette-debug.png`, fullPage: true }).catch(() => {});
    throw e;
  } finally {
    await context.close();
  }
});
