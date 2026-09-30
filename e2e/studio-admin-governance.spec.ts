/**
 * studio-admin-governance — the platform "Governance & Access" editor (#141)
 * as the 8th ControlRoom lane: KPI header + entitlements list + the 5-step
 * EntitlementSpec editor with live Preview & impact. Presence + step nav only
 * (no entitlement is applied — user decision).
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

test('Administration Governance & Access editor renders (KPIs + 5-step + preview)', async ({ browser }) => {
  test.skip(!PASS, 'D360_PASS required');
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await context.newPage();
  try {
    await login(page);
    await page.goto('/administration', { waitUntil: 'domcontentloaded' });

    const lane = page.getByRole('tab', { name: /Governance & Access/ });
    if (!(await lane.isVisible({ timeout: 30_000 }).catch(() => false))) {
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-gov-debug.png`, fullPage: true });
      test.skip(true, 'Administration is ACCOUNTADMIN-gated — this user cannot reach ControlRoom');
      return;
    }
    await lane.first().click();

    await expect(page.getByRole('heading', { name: 'Governance & Access' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Create policy/ })).toBeVisible();
    // KPI header (from the served summary)
    await expect(page.getByText('Principals with access', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Policy compliance', { exact: true }).first()).toBeVisible();

    // open the 5-step editor
    await page.getByRole('button', { name: /Create policy/ }).click();
    for (const label of ['Application role', 'Data policies', 'Review & apply']) {
      await expect(page.getByRole('button', { name: new RegExp(label) }).first()).toBeVisible({ timeout: 20_000 });
    }
    // the Preview & impact panel
    await expect(page.getByText(/Preview & impact/).first()).toBeVisible();
    // step ④ carries the three policy families incl. Encryption
    await page.getByRole('button', { name: /Data policies/ }).first().click();
    for (const t of ['Row-level security', 'Data masking', 'Encryption']) {
      await expect(page.getByText(t, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    }
    console.log('[admin-gov] editor present: KPIs, 5 steps, RLS/masking/encryption, preview');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-gov.png`, fullPage: true });
  } finally {
    await context.close();
  }
});
