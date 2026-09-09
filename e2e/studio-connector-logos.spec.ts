/**
 * studio-connector-logos — the connector catalogue cards carry real brand
 * logos (react-icons / Simple Icons) with a neutral fallback. Cosmetic; a
 * screenshot check + a presence assertion.
 *
 * Run (repo root):
 *   D360_PASS=$(grep -m1 '^PAT:' apps/data360/.env | awk '{print $2}') \
 *     SHOTS=/abs/dir npx playwright test e2e/studio-connector-logos.spec.ts --project=demo-video
 */
import { test, expect, type Page } from '@playwright/test';

const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';
const SHOTS = process.env.SHOTS ?? '';

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

test('connector catalogue cards show brand logos', async ({ browser }) => {
  test.skip(!PASS, 'D360_PASS required');
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  try {
    await login(page);
    await page.goto('/studio/source', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Add a source/ }).first().click({ timeout: 60_000 });
    await expect(page.getByText(/Which connection brings this data/i)).toBeVisible({ timeout: 60_000 });

    // a recognisable connector card carries an inline svg logo
    const snowflake = page.getByRole('button', { name: /Snowflake/ }).first();
    await expect(snowflake).toBeVisible({ timeout: 30_000 });
    await expect(snowflake.locator('svg').first()).toBeVisible();
    const svgCount = await page.locator('button svg').count();
    console.log(`[logos] inline svg logos on the page = ${svgCount}`);
    expect(svgCount).toBeGreaterThan(5);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/connector-logos.png`, fullPage: true });
  } finally {
    await context.close();
  }
});
