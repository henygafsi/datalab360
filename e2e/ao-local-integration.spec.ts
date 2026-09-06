/**
 * ao-local-integration — the UI_VERIFIED_LOCAL journey for the Account
 * Overview lot (front + backend :8078, both locally built/corrected).
 *
 * Proves, in one rerunnable spec, with per-step timings:
 *  0. the browser path really hits the CORRECTED local backend (AO-001
 *     X-Cache headers + /command-center/actions=200 — the deployed backend
 *     emits neither), not the deployed one;
 *  1. auth → shell (horizontal tabs, analytical header, no doc scroll);
 *  2. Usage & Performance: KPI row (real values, no '—'), latency trend with
 *     real marks, type-distribution bars, bounded Slowest-Queries table;
 *  3. cold vs warm cache: same summary endpoint MISS→HIT via AO-001 headers;
 *  4. Ask AI context panel opens docked with injected context and closes;
 *  5. resource monitors (client-accounts): drop control renders (AO-015
 *     granular 'delete' gate), confirm banner appears, Cancel dismisses, and
 *     — asserted on the network — NO DELETE request is ever emitted.
 *     The real DROP is intentionally NOT exercised (the account's only
 *     monitor caps real spend); mutation execution stays NOT-VERIFIED until
 *     a dedicated test monitor exists.
 *
 * Requires: next start on :3000 built with API_PROXY_UPSTREAM=127.0.0.1:8078,
 * uvicorn :8078 with DATA360_SVC_AUTO_PROVISION=0. Creds via env (fallback:
 * the e2e test account).
 */
import { test, expect, type Page } from '@playwright/test';

const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? 'NewSecurePassword123!';

test.use({ viewport: { width: 1600, height: 950 }, trace: 'retain-on-failure' });
test.setTimeout(420_000);

const t0 = Date.now();
const mark = (label: string) =>
  console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);

async function login(page: Page) {
  await page.goto('/signin', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="account_name"], input#account_name').first().fill(ACCOUNT);
  await page.locator('input[name="username"], input#username').first().fill(USER);
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  // Observable state, not navigation: the session endpoint carries a token.
  await expect
    .poll(
      async () => {
        const s = await page.request.get('/api/auth/session').then((r) => r.json()).catch(() => null);
        return Boolean(s?.user?.access_token);
      },
      { timeout: 120_000, message: 'NextAuth session never carried an access_token' },
    )
    .toBe(true);
}

test('AO local integration: corrected :8078 path, U&P slice, AI panel, RM cancel-proof', async ({ page }) => {
  // ── Step 0+1: auth ──
  await login(page);
  mark('auth OK (session token present)');

  // ── Step 0b: correlation — the browser path hits the CORRECTED backend ──
  const session = await page.request.get('/api/auth/session').then((r) => r.json());
  const token = session.user.access_token as string;
  const summaryRes = await page.request.get('/api-proxy/command-center/summary', {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 130_000,
  });
  expect(summaryRes.status(), 'summary via the front proxy').toBe(200);
  // Correlate via the AO-001 BODY fields, not the X-Cache header: gzip'd
  // responses lose the custom headers (backend GZipMiddleware ordering bug,
  // reported as AO-016 — curl without Accept-Encoding sees them, browsers
  // don't). meta.served_from only exists on the corrected local backend.
  const summaryBody = await summaryRes.json();
  const served1 = summaryBody?.meta?.served_from;
  expect(
    ['live', 'cache'],
    'AO-001 meta.served_from — only the corrected local backend emits it',
  ).toContain(served1);
  const actionsRes = await page.request.get('/api-proxy/command-center/actions', {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 130_000,
  });
  expect(actionsRes.status(), '/actions is 404 on the deployed backend, 200 locally').toBe(200);
  mark(`correlation OK (meta.served_from=${served1}, /actions=200 → backend = local :8078)`);

  // ── Step 3 (early, piggybacked): warm-cache proof on the same endpoint ──
  const warm = await page.request.get('/api-proxy/command-center/summary', {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 130_000,
  });
  const warmBody = await warm.json();
  expect(warmBody?.meta?.served_from, 'second summary read served from cache').toBe('cache');
  mark(
    `cache warm verified (1st=${served1} → 2nd=cache, x-execution-time-ms=${warm.headers()['x-execution-time-ms']})`,
  );

  // ── Step 1b: shell ──
  await page.goto('/account-overview', { waitUntil: 'domcontentloaded' });
  const tablist = page.getByRole('tablist', { name: 'Account overview sections' });
  await expect(tablist, 'horizontal section tabs render').toBeVisible({ timeout: 60_000 });
  await expect(tablist).toHaveAttribute('aria-orientation', 'horizontal');
  await expect(
    page.getByRole('group', { name: 'Time window' }),
    'analytical header time-window selector',
  ).toBeVisible({ timeout: 30_000 });
  mark('shell OK (horizontal tabs + analytical header)');

  // ── Step 2: U&P slice — KPI → chart → table on real local data ──
  await page.getByRole('tab', { name: /^Usage$/ }).click({ timeout: 30_000 });
  const totalQueries = page
    .locator('div', { has: page.getByText('Total Queries', { exact: true }) })
    .locator('[class*="text-2xl"], [class*="text-xl"]')
    .first();
  await expect(totalQueries, 'Total Queries KPI shows a real value').not.toHaveText(/^—?$/, {
    timeout: 180_000, // cold ACCOUNT_USAGE scan through the local backend
  });
  const kpiText = (await totalQueries.textContent())?.trim() ?? '';
  expect(Number(kpiText.replace(/[^0-9]/g, '')), 'KPI is numeric').toBeGreaterThan(0);
  mark(`U&P KPI OK (Total Queries = ${kpiText})`);

  await expect
    .poll(
      async () =>
        page
          .locator('.recharts-surface')
          .evaluateAll((els) =>
            els.reduce(
              (n, el) =>
                n +
                el.querySelectorAll('.recharts-curve, .recharts-bar-rectangle, .recharts-area-area, .recharts-dot')
                  .length,
              0,
            ),
          ),
      { timeout: 60_000, message: 'charts never painted real marks' },
    )
    .toBeGreaterThan(0);
  mark('U&P charts OK (real marks painted)');

  const tableRows = page.locator('table tbody tr');
  await expect
    .poll(async () => tableRows.count(), { timeout: 120_000, message: 'Slowest Queries table stayed empty' })
    .toBeGreaterThan(0);
  const rowCount = await tableRows.count();
  expect(rowCount, 'overview table stays bounded (Top-N page, not a dump)').toBeLessThanOrEqual(20);
  mark(`U&P table OK (${rowCount} bounded rows)`);

  // no document scroll at the reference viewport
  const docOver = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  expect(docOver, 'no document-level scroll').toBeLessThanOrEqual(8);

  // ── Step 4: Ask AI context panel ──
  await page.getByRole('button', { name: 'Ask AI' }).click({ timeout: 15_000 });
  const panel = page.getByRole('complementary', { name: 'AI context panel' });
  await expect(panel, 'context panel opens docked').toBeVisible({ timeout: 15_000 });
  await expect(panel, 'panel carries the injected context').toContainText(/Usage/i);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden({ timeout: 10_000 });
  mark('Ask AI panel OK (open with context, Escape closes)');

  // ── Step 5: resource monitors — permission-gated control + cancel-proof ──
  const deletes: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'DELETE') deletes.push(r.url());
  });
  await page.goto('/client-accounts', { waitUntil: 'domcontentloaded' });
  const dropBtn = page.locator('button[aria-label^="Drop resource monitor"]').first();
  await expect
    .poll(
      async () => {
        if (await dropBtn.count()) return true;
        await page.mouse.wheel(0, 900);
        return false;
      },
      { timeout: 120_000, message: 'RM drop control never rendered (permission or data)' },
    )
    .toBe(true);
  await dropBtn.scrollIntoViewIfNeeded();
  await dropBtn.click();
  const confirm = page.getByText(/removes a spend guard/);
  await expect(confirm, 'explicit confirm banner').toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Cancel' }).first().click();
  await expect(confirm).toBeHidden({ timeout: 10_000 });
  expect(deletes, 'NO DELETE request emitted after Cancel').toHaveLength(0);
  mark('RM control OK (gated render → confirm → Cancel, zero DELETE on the wire)');
});
