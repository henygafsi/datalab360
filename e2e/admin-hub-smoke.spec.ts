import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * ADMIN HUB SMOKE — verifies the consolidated /administration hub after the
 * sub-page → tab refactor:
 *   (a) every top-level tab renders non-blank with zero uncaught page errors
 *   (b) the embedded Access Control Center (former sub-page) shows its sub-tabs
 *   (c) the eliminated routes redirect into the hub (?tab=)
 *
 * Run: D360_PASS=... npx playwright test e2e/admin-hub-smoke.spec.ts --reporter=line
 */

const PASS = process.env.D360_PASS ?? '';
const SHOTS = path.join(__dirname, 'admin-hub-artifacts');
const STATE = path.join(SHOTS, '.auth-state.json');

fs.mkdirSync(SHOTS, { recursive: true });

const TABS = [
  'actions',
  'health',
  'performance',
  'access',
  'costGov',
  'projects',
  'featureGov',
  'apiHealth',
  'config',
];

async function signIn(page: Page) {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });
}

test.use({ storageState: STATE, video: 'off' });
test.setTimeout(6 * 60_000);

test.beforeAll(async ({ browser }) => {
  if (!fs.existsSync(STATE)) fs.writeFileSync(STATE, JSON.stringify({ cookies: [], origins: [] }));
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page);
  await ctx.storageState({ path: STATE });
  await ctx.close();
});

test('every admin hub tab renders non-blank, no page errors', async ({ page }) => {
  const results: Record<string, { chars: number; errors: string[]; verdict: string }> = {};

  for (const tab of TABS) {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`/administration?tab=${tab}`, { waitUntil: 'domcontentloaded' });
    // Let the active panel fetch + render (panels are lazy per tab).
    await page.waitForTimeout(3500);
    const main = page.locator('main, [role="tabpanel"], body');
    const txt = (await main.first().innerText().catch(() => '')) || '';
    const chars = txt.trim().length;
    const verdict = errors.length ? 'ERROR' : chars > 120 ? 'RICH' : 'THIN';
    results[tab] = { chars, errors, verdict };
    await page.screenshot({ path: path.join(SHOTS, `tab-${tab}.png`), fullPage: false }).catch(() => {});
    page.removeAllListeners('pageerror');
  }

  fs.writeFileSync(path.join(SHOTS, 'smoke-results.json'), JSON.stringify(results, null, 2));
  // eslint-disable-next-line no-console
  console.log('ADMIN_HUB_SMOKE', JSON.stringify(results, null, 2));

  // Hard assertion: no tab throws an uncaught error, none is blank.
  for (const tab of TABS) {
    expect(results[tab].errors, `tab ${tab} page errors`).toEqual([]);
    expect(results[tab].chars, `tab ${tab} content chars`).toBeGreaterThan(120);
  }
});

test('embedded Access Control Center shows its sub-tabs', async ({ page }) => {
  await page.goto('/administration?tab=access', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  // Reachability: every panel that used to be a sub-page section must still be
  // reachable as a sub-tab (guards against orphaning panels during the merge).
  // ("Access Control" is intentionally omitted — it collides with the hub's
  // top-level tab label; these names are unique to the embedded surface.)
  for (const name of ['Roles & Permissions', 'Role Governance', 'Performance & Monitoring', 'Cache & Calls', 'Usage & Audit', 'Provisioning', 'Access Requests']) {
    await expect(page.getByRole('tab', { name, exact: true }), `access sub-tab "${name}" reachable`).toBeVisible();
  }
  await page.screenshot({ path: path.join(SHOTS, 'access-embedded.png') }).catch(() => {});
});

test('eliminated sub-page routes redirect into the hub', async ({ page }) => {
  for (const [route, expectTab] of [
    ['/administration/access-center', 'tab=access'],
    ['/administration/feature-governance', 'tab=featureGov'],
    ['/admin', ''],
  ] as const) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const url = page.url();
    expect(url, `${route} should land on /administration`).toContain('/administration');
    if (expectTab) expect(url, `${route} should carry ${expectTab}`).toContain(expectTab);
  }
});
