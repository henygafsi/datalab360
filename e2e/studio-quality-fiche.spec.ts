/**
 * studio-quality-fiche.spec.ts — the scan→model→quality UX pass.
 *
 *   D360_PASS=$(grep -m1 '^PAT:' apps/data360/.env | awk '{print $2}') \
 *     npx playwright test e2e/studio-quality-fiche.spec.ts --project=demo-video
 *
 * Q1 the data-quality SCORE is honest on an unmeasured model: it reads
 *    "Not measured yet", never a green pass for an app that holds no data.
 * Q2 on a modeled star the score renders its gates and the "KPIs ready to
 *    explore" bridge is present.
 * Q3 the rich source fiche opens for a source ALREADY CONNECTED (Sources
 *    tab → Full sheet → the card with its storage cost).
 * Q4 the REST connector builder opens where you pick a source.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const PASS = process.env.D360_PASS ?? '';
const EMPTY = 'proj_f90220f34c3b'; // the user's screenshot — nothing modeled
const MODELED = 'proj_576e16333cdf'; // 10-source snowflaked star

let context: BrowserContext;
let page: Page;

async function login(p: Page) {
  await p.goto('/signin', { waitUntil: 'domcontentloaded' });
  await p.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-ky11038');
  await p.locator('input[name="username"], input#username').first().fill('ORGAADMIN_USER');
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

async function openApp(p: Page, id: string) {
  await p.goto(`/studio/apps/${id}`, { waitUntil: 'domcontentloaded' });
  await p.getByRole('tablist', { name: /Workspace views/i }).waitFor({ timeout: 60_000 });
}

test.describe.configure({ mode: 'serial', timeout: 240_000 });

test.beforeAll(async ({ browser }) => {
  test.skip(!PASS, 'D360_PASS required');
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  await login(page);
});
test.afterAll(async () => {
  await context?.close();
});

test('Q1 — the quality score is honest on an unmeasured model', async () => {
  await openApp(page, EMPTY);
  await page.getByRole('tab', { name: 'Quality' }).click();
  await expect(page.getByRole('heading', { name: /Data quality score/i })).toBeVisible({ timeout: 30_000 });
  // the trap the self-check would miss: an empty model must NOT read a green pass
  await expect(page.getByText(/Not measured yet/i).first()).toBeVisible();
  await expect(page.getByText(/\d+ of \d+ checks pass/i)).toHaveCount(0);
  // the bridge still renders (with its honest empty state)
  await expect(page.getByRole('heading', { name: /KPIs ready to explore/i })).toBeVisible();
});

test('Q2 — the score gates and KPIs-ready render on a modeled star', async () => {
  await openApp(page, MODELED);
  await page.getByRole('tab', { name: 'Quality' }).click();
  await expect(page.getByRole('heading', { name: /Data quality score/i })).toBeVisible({ timeout: 30_000 });
  // at least one gate line is present (pass / to resolve / not measured)
  await expect(page.getByText(/Data present/i).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /KPIs ready to explore/i })).toBeVisible();
});

test('Q3 — the rich fiche opens for a source already connected', async () => {
  await openApp(page, MODELED);
  await page.getByRole('tab', { name: 'Sources' }).click();
  const fullSheet = page.getByRole('button', { name: /Full sheet/i }).first();
  await fullSheet.waitFor({ timeout: 30_000 });
  await fullSheet.click();
  // the card loads a rich sheet (health/cost/relationships) — a cold read
  // is heavy, so wait for the content the way the service does
  await expect(page.getByText(/What this source means, in your words/i).first()).toBeVisible({
    timeout: 120_000,
  });
});

test('Q4 — the REST builder opens where you pick a source', async () => {
  await page.goto('/studio/source', { waitUntil: 'domcontentloaded' });
  const tile = page.getByText(/Custom REST API/i).first();
  await tile.waitFor({ timeout: 30_000 });
  await tile.click();
  // advance from the connector grid to the picked-connectors setup
  const cont = page.getByRole('button', { name: /^Continue$/i }).first();
  if (await cont.count()) await cont.click().catch(() => {});
  const setup = page.getByRole('button', { name: /Set it up here/i }).first();
  await setup.waitFor({ timeout: 30_000 });
  await setup.click();
  await expect(page.getByRole('heading', { name: /Build a REST connection/i })).toBeVisible({ timeout: 15_000 });
});
