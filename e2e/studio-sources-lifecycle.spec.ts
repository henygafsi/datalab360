/**
 * studio-sources-lifecycle — the Sources slice: connections, sheets, and
 * the guided add journey.
 *
 * /studio/source is no longer a wizard-only page: it opens on two dense
 * local views — Connections (reusable technical access) and Objects in use
 * (what an application actually reads) — with the connection sheet and the
 * object/columns sheet opening IN PLACE of the list, and the guided add
 * journey behind one primary « Add a source » action.
 *
 * These tests assert structure and honesty (words shown, states named,
 * nothing invented), not warehouse figures: they stay meaningful whether
 * or not the warehouse answers. Mutation proofs (attach, detach, REST
 * edit) are exercised against throwaway drafts only — never the shared
 * fixtures.
 *
 * Run:
 *   D360_PASS=$(grep -m1 '^PAT:' apps/data360/.env | awk '{print $2}') \
 *     npx playwright test e2e/studio-sources-lifecycle.spec.ts --project=demo-video
 */
import { test, expect, type Page } from '@playwright/test';

const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

let page: Page;

async function login(p: Page) {
  await p.goto('/signin', { waitUntil: 'domcontentloaded' });
  await p.locator('input[name="account_name"], input#account_name').first().fill(ACCOUNT);
  await p.locator('input[name="username"], input#username').first().fill(USER);
  await p.locator('input[type="password"]').first().fill(PASS);
  await p.locator('button[type="submit"]').first().click();
  await expect
    .poll(
      async () =>
        Boolean(
          await p.request
            .get('/api/auth/session')
            .then((r) => r.json())
            .then((s) => s?.user?.access_token)
            .catch(() => null),
        ),
      { timeout: 90_000 },
    )
    .toBe(true);
}

/** The brand rule: vendor names never reach customer-facing copy. */
async function noVendorLeak(p: Page) {
  const text = await p.evaluate(() => document.body.innerText);
  for (const word of ['Kimi', 'Cortex']) expect(text).not.toContain(word);
  // 'Snowflake' may legitimately appear inside IDENTIFIERS (a database
  // named SNOWFLAKE_INTELLIGENCE stays as-is); refuse it only as prose.
  expect(text).not.toMatch(/(?<![A-Z0-9_])Snowflake(?![A-Z0-9_])/);
}

test.beforeAll(async ({ browser }) => {
  test.skip(!PASS, 'D360_PASS is required (grep PAT: apps/data360/.env)');
  page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  await login(page);
  await page.goto('/studio/source', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tablist', { name: 'Sources views' }).waitFor({ timeout: 60_000 });
});

test.afterAll(async () => page?.close());

test('the page opens on the Connections view — a dense list, not big cards', async () => {
  await expect(page.getByRole('tab', { name: 'Connections' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Add a source' })).toBeVisible();

  // the dense table with its lifecycle columns
  for (const h of ['Connection', 'Type', 'Environment', 'Last test', 'Objects in use']) {
    await expect(page.locator('th', { hasText: h }).first()).toBeVisible();
  }
  await noVendorLeak(page);

  // nothing is selected → no sheet is open
  await expect(page.getByRole('button', { name: 'Close the connection sheet' })).toHaveCount(0);
});

test('a connection sheet opens in place, tests with distinct checks, and closes', async () => {
  const firstOpen = page.getByRole('button', { name: 'Open' }).first();
  await firstOpen.click();
  await expect(page.getByRole('button', { name: 'Close the connection sheet' })).toBeVisible();
  await expect(page.getByText('Identity & capabilities')).toBeVisible();

  // the explicit bounded test — its result names distinct checks and
  // NEVER promotes a metadata read into « all tables readable »
  const testBtn = page.getByRole('button', { name: 'Test the connection' });
  if (await testBtn.isVisible().catch(() => false)) {
    await testBtn.click();
    await expect(page.getByText('metadata discovery')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('write access')).toBeVisible();
    await expect(page.getByText(/identity tested/i)).toBeVisible();
    const body = await page.evaluate(() => document.body.innerText);
    expect(body).toContain('not tested');
  }

  await page.getByRole('button', { name: 'Close the connection sheet' }).click();
  await expect(page.getByRole('button', { name: 'Close the connection sheet' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Connections' })).toBeVisible();
});

test('Objects in use keeps an explicit application context and opens the object sheet', async () => {
  await page.getByRole('tab', { name: 'Objects in use' }).click();
  await expect(page.getByLabel('Application')).toBeVisible();

  // the cold first read announces itself instead of spinning silently
  const loading = page.getByText(/first read profiles each source/);
  if (await loading.isVisible().catch(() => false)) {
    await loading.waitFor({ state: 'hidden', timeout: 180_000 });
  }

  const table = page.locator('table').first();
  const anyRow = table.locator('tbody tr').first();
  if (await anyRow.isVisible().catch(() => false)) {
    // quality is « not evaluated » when absent — never a healthy default
    const body = await page.evaluate(() => document.body.innerText);
    expect(body).not.toMatch(/\b0 check\(s\)/);

    await anyRow.getByRole('button').first().click();
    // the sheet header: business name + copyable physical path
    await expect(page.getByRole('button', { name: /Copy the physical path/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Used by')).toBeVisible();
    // columns are read through the model — either the table or the honest sentence
    const cols = page.getByText('Columns', { exact: false }).first();
    await expect(cols).toBeVisible();
    await page.getByRole('button', { name: 'Objects in use' }).first().click();
  }
  await noVendorLeak(page);
});

test('deep links address the view directly', async () => {
  await page.goto('/studio/source?view=objects', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('tab', { name: 'Objects in use' })).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 30_000 },
  );
  await page.goto('/studio/source?view=connections', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('tab', { name: 'Connections' })).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 30_000 },
  );
});

test('the guided add journey leads with « reuse or create a connection »', async () => {
  await page.getByRole('button', { name: 'Add a source' }).click();
  await expect(page.getByText('Which connection brings this data?')).toBeVisible();
  // the five lifecycle steps are named on the rail
  for (const s of ['Connection', 'Configure & test', 'Pick objects', 'What we read', 'Understand & attach']) {
    await expect(page.getByText(s, { exact: true }).first()).toBeVisible();
  }

  // pick the warehouse and walk to « Configure & test » — nothing to
  // configure on a reuse-only path, and the step says so
  await page.getByRole('button', { name: /Your data warehouse/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Nothing to configure')).toBeVisible();

  // back out — the abandoned journey must not leave a phantom state
  await page.getByRole('button', { name: '← Back to your sources' }).click();
  await expect(page.getByRole('tablist', { name: 'Sources views' })).toBeVisible();
  await noVendorLeak(page);
});

test('both working viewports hold the layout without horizontal scroll', async () => {
  for (const vp of [
    { width: 1366, height: 768 },
    { width: 1600, height: 950 },
  ]) {
    await page.setViewportSize(vp);
    await page.goto('/studio/source', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tablist', { name: 'Sources views' }).waitFor({ timeout: 60_000 });
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflowX, `${vp.width}×${vp.height} must not scroll horizontally`).toBeLessThanOrEqual(1);
    await expect(page.getByRole('button', { name: 'Add a source' })).toBeVisible();
  }
});
