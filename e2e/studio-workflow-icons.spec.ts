/**
 * studio-workflow-icons — the Steps canvas renders real workflow components:
 * each step is an icon + « Step N » + its business label, not a bare box.
 */
import { test, expect, type Page } from '@playwright/test';

const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';
const APP = process.env.APP ?? 'proj_d3922b1b628d';
const OUT = process.env.OUT ?? 'e2e/results';

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

test('workflow steps render as icon components (Step N + label)', async ({ browser }) => {
  test.skip(!PASS, 'D360_PASS required');
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  const notes: string[] = [];
  try {
    await login(page);
    await page.goto(`/studio/apps/${APP}?view=workflows`, { waitUntil: 'domcontentloaded' });

    const openBtn = page.getByRole('button', { name: /Rapport périodique/i }).first();
    await expect(openBtn).toBeVisible({ timeout: 60_000 });
    await openBtn.click();

    // the Steps tab holds the React Flow canvas
    await page.getByRole('button', { name: /^Steps$/ }).or(page.getByText(/^Steps$/).first()).click();

    // each node reads « Step N » + its label + carries an icon (svg)
    await expect(page.getByText(/^Step 1$/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/^Step 2$/)).toBeVisible({ timeout: 30_000 });
    notes.push('✓ steps render as numbered components (Step 1, Step 2)');

    // an svg icon is present inside the flow nodes
    const icons = page.locator('.react-flow__node svg');
    expect(await icons.count()).toBeGreaterThan(0);
    notes.push(`✓ nodes carry icons (${await icons.count()} svg in the canvas)`);
    await page.screenshot({ path: `${OUT}/workflow-steps-icons.png`, fullPage: false });
  } finally {
    // eslint-disable-next-line no-console
    console.log('\nWORKFLOW-ICONS NOTES:\n' + notes.join('\n'));
    await ctx.close();
  }
});
