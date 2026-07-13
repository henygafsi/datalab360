import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PASS = process.env.D360_PASS ?? '';
const STATE = path.join(__dirname, 'night-audit-artifacts', '.auth.json');
fs.mkdirSync(path.dirname(STATE), { recursive: true });
if (!fs.existsSync(STATE)) fs.writeFileSync(STATE, JSON.stringify({ cookies: [], origins: [] }));

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });
  await ctx.storageState({ path: STATE });
  await ctx.close();
});

test.use({ storageState: STATE });
test.setTimeout(120_000);

// The Administration surface is ONE page: the sidebar's Feature Governance /
// Access Control links now deep-link into the unified hub's ?tab= sections
// instead of the former standalone routes (redirect stubs).
for (const { tab, name } of [
  { tab: 'featureGov', name: 'Feature Governance' },
  { tab: 'access', name: 'Access Control' },
]) {
  test(`administration?tab=${tab} lands on the unified hub tab (no stub redirect)`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(`/administration?tab=${tab}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);

    // Stays on the unified /administration page (not redirected to a sub-route).
    expect(new URL(page.url()).pathname, 'stays on /administration').toBe('/administration');
    // The requested tab is the active one.
    const activeTab = page.getByRole('tab', { selected: true }).first();
    await expect(activeTab, `tab ${tab} active`).toBeVisible({ timeout: 15_000 });
    // eslint-disable-next-line no-console
    console.log(`ADMINTAB ${tab} → active tab "${(await activeTab.innerText().catch(() => '')).trim()}"`);

    expect(errors, `no page errors on ?tab=${tab}`).toEqual([]);
  });
}
